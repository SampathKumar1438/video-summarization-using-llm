import { getDatabase } from '../config/database.js';
import { extractAudio, getVideoDuration } from './ffmpegService.js';
import { transcribeAudio } from './whisperService.js';
import { analyzeVideo } from './llmService.js';
import { generateEmbeddings, storeEmbedding } from './embeddingService.js';
import { createHighlightVideo } from './ffmpegService.js';

// Simple sequential queue
const processingQueue = [];
let isProcessing = false;

/**
 * Add video to processing queue
 * @param {number} videoId - Video ID to process
 */
export function addToQueue(videoId) {
    processingQueue.push(videoId);
    console.log(`Video ${videoId} added to queue. Queue length: ${processingQueue.length}`);
    processNext();
}

/**
 * Process next video in queue
 */
async function processNext() {
    if (isProcessing || processingQueue.length === 0) {
        return;
    }

    isProcessing = true;
    const videoId = processingQueue.shift();

    console.log(`Starting processing for video ${videoId}`);

    try {
        await processVideo(videoId);
        console.log(`Video ${videoId} processed successfully`);
    } catch (error) {
        console.error(`Error processing video ${videoId}:`, error);
        await updateVideoStatus(videoId, 'failed', error.message);
    } finally {
        isProcessing = false;
        processNext(); // Process next in queue
    }
}

/**
 * Main video processing pipeline
 * @param {number} videoId - Video ID to process
 */
export async function processVideo(videoId) {
    const db = getDatabase();

    try {
        console.log(`Starting processing for video ${videoId}`);
        await updateVideoStatus(videoId, 'processing');

        // Get video details
        const video = await db.get('SELECT * FROM videos WHERE id = $1', [videoId]);
        if (!video) throw new Error('Video not found');

        // Step 1: Extract Audio
        console.log('Step 1: Extracting audio...');
        const { audioPath } = await extractAudio(video.file_path, videoId);

        // Step 2: Get Duration & Transcribe
        await updateVideoStatus(videoId, 'transcribing');
        const duration = await getVideoDuration(video.file_path);
        await db.run('UPDATE videos SET duration_seconds = $1 WHERE id = $2', [duration, videoId]);

        console.log(`Video duration: ${duration}s. Transcribing...`);
        const transcription = await transcribeAudio(audioPath);

        // Store transcript segments
        const segments = [];
        for (let index = 0; index < transcription.length; index++) {
            const s = transcription[index];
            const result = await db.run(
                'INSERT INTO transcripts (video_id, segment_index, start_time, end_time, text, confidence) VALUES ($1, $2, $3, $4, $5, $6)',
                [videoId, index, s.start_time, s.end_time, s.text, s.confidence]
            );
            segments.push({
                id: result.lastInsertRowid,
                segment_index: index,
                text: s.text,
                start_time: s.start_time,
                end_time: s.end_time,
                confidence: s.confidence
            });
        }

        console.log(`Stored ${segments.length} transcript segments.`);

        // Step 3: Run AI Tasks (Unified Pipeline)
        console.log('Step 3: Running unified AI analysis...');
        await updateVideoStatus(videoId, 'analyzing');

        // Parallel: Embeddings + Main Analysis
        const [analysisResult, embeddingDocs] = await Promise.all([
            analyzeVideo(segments, duration),
            generateEmbeddings(segments.map(s => ({ id: s.id, text: s.text })))
        ]);

        // --- Save Analysis Results ---

        // 1. Summary
        const { summary } = analysisResult;
        const existingSummary = await db.get('SELECT id FROM summaries WHERE video_id = $1', [videoId]);
        if (existingSummary) {
            await db.run('UPDATE summaries SET full_summary = $1, brief_summary = $2 WHERE video_id = $3',
                [summary.full, summary.brief, videoId]);
        } else {
            await db.run('INSERT INTO summaries (video_id, full_summary, brief_summary) VALUES ($1, $2, $3)',
                [videoId, summary.full, summary.brief]);
        }

        // 2. Chapters
        for (let i = 0; i < analysisResult.chapters.length; i++) {
            const c = analysisResult.chapters[i];
            await db.run(
                'INSERT INTO chapters (video_id, chapter_index, title, summary, start_time, end_time) VALUES ($1, $2, $3, $4, $5, $6)',
                [videoId, i, c.title, c.summary, c.start_time, c.end_time]
            );
        }

        // 3. Search Index (Keywords) - Store in notes
        if (analysisResult.search_index && analysisResult.search_index.length > 0) {
            await db.run(
                'INSERT INTO notes (video_id, note_index, content, start_time, end_time) VALUES ($1, $2, $3, $4, $5)',
                [videoId, 0, "Keywords: " + analysisResult.search_index.join(', '), 0, 0]
            );
        }

        // 4. Embeddings - Store directly in transcripts table
        console.log('Step 4: Storing embeddings in pgvector...');
        await updateVideoStatus(videoId, 'embedding');

        for (const emb of embeddingDocs) {
            await storeEmbedding(emb.id, emb.embedding);
        }
        console.log(`Stored ${embeddingDocs.length} embeddings in PostgreSQL`);

        // 5. Highlights
        let highlightsToRender = null;
        if (analysisResult.highlights && analysisResult.highlights.length > 0) {
            // Create parent highlight record
            const hlResult = await db.run(
                "INSERT INTO highlights (video_id, status) VALUES ($1, 'pending')",
                [videoId]
            );
            const hlId = hlResult.lastInsertRowid;

            for (let i = 0; i < analysisResult.highlights.length; i++) {
                const h = analysisResult.highlights[i];
                await db.run(
                    'INSERT INTO highlight_clips (highlight_id, clip_index, start_time, end_time, category, reason, transcript_excerpt) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [hlId, i, h.start_time, h.end_time, h.category || 'general', h.reason, h.transcript_excerpt || null]
                );
            }

            highlightsToRender = { id: hlId, clips: analysisResult.highlights };
        }

        // Step 5: Render Highlight Video
        if (highlightsToRender && highlightsToRender.clips && highlightsToRender.clips.length > 0) {
            console.log('Step 5: Rendering Highlight Video...');
            try {
                await db.run("UPDATE highlights SET status = 'generating' WHERE id = $1", [highlightsToRender.id]);
                const highlightPath = await createHighlightVideo(video.file_path, highlightsToRender.clips, videoId);
                await db.run("UPDATE highlights SET status = 'completed', file_path = $1 WHERE id = $2", [highlightPath, highlightsToRender.id]);
                console.log('Highlight video generated:', highlightPath);
            } catch (hlError) {
                console.error('Highlight rendering failed:', hlError);
                await db.run("UPDATE highlights SET status = 'failed' WHERE id = $1", [highlightsToRender.id]);
            }
        }

        // Complete
        await updateVideoStatus(videoId, 'completed');
        console.log(`Video ${videoId} processing complete.`);

    } catch (error) {
        console.error(`Fatal error processing video ${videoId}:`, error);
        await updateVideoStatus(videoId, 'failed', error.message);
    }
}

/**
 * Update video processing status
 */
async function updateVideoStatus(videoId, status, errorMessage = null) {
    const db = getDatabase();
    await db.run(
        'UPDATE videos SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [status, errorMessage, videoId]
    );
}

/**
 * Get queue status
 */
export function getQueueStatus() {
    return {
        isProcessing,
        queueLength: processingQueue.length,
        queue: [...processingQueue]
    };
}

export default { addToQueue, getQueueStatus };
