import { getDatabase } from '../config/database.js';
import { extractAudio, getVideoDuration } from './ffmpegService.js';
import { transcribeAudio } from './whisperService.js';
import { analyzeVideo } from './llmService.js';
import { generateEmbeddings, indexEmbeddings } from './embeddingService.js';
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
        updateVideoStatus(videoId, 'failed', error.message);
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
        updateVideoStatus(videoId, 'processing');

        // Get video details
        const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
        if (!video) throw new Error('Video not found');

        // Step 1: Extract Audio
        console.log('Step 1: Extracting audio...');
        const { audioPath } = await extractAudio(video.file_path, videoId);

        // Step 2: Get Duration & Transcribe
        const duration = await getVideoDuration(video.file_path);
        db.prepare('UPDATE videos SET duration_seconds = ? WHERE id = ?').run(duration, videoId);

        console.log(`Video duration: ${duration}s. Transcribing...`);
        const transcription = await transcribeAudio(audioPath);

        // Store transcript segments
        const insertSegment = db.prepare(
            'INSERT INTO transcripts (video_id, segment_index, start_time, end_time, text, confidence) VALUES (?, ?, ?, ?, ?, ?)'
        );

        const segments = transcription.map((s, index) => {
            const result = insertSegment.run(videoId, index, s.start_time, s.end_time, s.text, s.confidence);
            return {
                id: result.lastInsertRowid,
                segment_index: index,
                text: s.text,
                start_time: s.start_time,
                end_time: s.end_time,
                confidence: s.confidence
            };
        });

        console.log(`Stored ${segments.length} segments.`);

        // Step 3: Run AI Tasks (Unified Pipeline)
        console.log('Step 3: Running unified AI analysis...');

        // Parallel: Embeddings + Main Analysis
        const [analysisResult, embeddingDocs] = await Promise.all([
            analyzeVideo(segments, duration),
            generateEmbeddings(segments.map(s => ({ id: s.id, text: s.text })))
        ]);

        // --- Save Analysis Results ---

        // 1. Summary
        const { summary } = analysisResult;
        const existingSummary = db.prepare('SELECT id FROM summaries WHERE video_id = ?').get(videoId);
        if (existingSummary) {
            db.prepare('UPDATE summaries SET full_summary = ?, brief_summary = ? WHERE video_id = ?')
                .run(summary.full, summary.brief, videoId);
        } else {
            db.prepare('INSERT INTO summaries (video_id, full_summary, brief_summary) VALUES (?, ?, ?)')
                .run(videoId, summary.full, summary.brief);
        }

        // 2. Chapters
        const insertChapter = db.prepare('INSERT INTO chapters (video_id, chapter_index, title, summary, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)');
        analysisResult.chapters.forEach((c, i) => {
            insertChapter.run(videoId, i, c.title, c.summary, c.start_time, c.end_time);
        });

        // 3. Search Index (Keywords)
        // Store as a comma-separated string in summaries or a new table? 
        // User asked for "searchable index". We'll just log it for now or assume the search controller uses it? 
        // Actually, the requirement said "searchable index" but didn't specify a DB schema change. 
        // We'll insert these into a 'keywords' field if it existed, but let's just stick to the requested 
        // searchController logic which used SQL LIKE. 
        // For better search, we can append these keywords to the transcript or summary text implicitly, 
        // or if we strictly followed a schema, we'd add a tags table. 
        // Let's at least save them to the summary 'brief_summary' or similar if no other place?
        // Actually best practice: creating a 'tags' table or similar. 
        // Since I can't change DB schema easily without migrations (User said "Modify code directly"), 
        // I will assume the search controller just searches existing text. 
        // BUT, I can create a simple JSON file or use the `notes` table to store keywords as a hack if needed.
        // Waiting... request said "Searchable index". 
        // I'll make sure the `searchController` uses the text we have. 
        // I will put keywords into the `notes` table as a "Keywords" entry so they are indexed/searchable.
        if (analysisResult.search_index && analysisResult.search_index.length > 0) {
            const insertNote = db.prepare('INSERT INTO notes (video_id, note_index, content, start_time, end_time) VALUES (?, ?, ?, ?, ?)');
            insertNote.run(videoId, 0, "Keywords: " + analysisResult.search_index.join(', '), 0, 0);
        }

        // 4. Embeddings
        await indexEmbeddings(videoId, embeddingDocs);
        const insertEmb = db.prepare('INSERT INTO embeddings (video_id, transcript_id, faiss_index) VALUES (?, ?, ?)');
        embeddingDocs.forEach((e, i) => insertEmb.run(videoId, e.id, i));

        // 5. Highlights
        let highlightsToRender = [];
        if (analysisResult.highlights && analysisResult.highlights.length > 0) {
            const insertHighlight = db.prepare('INSERT INTO highlight_clips (highlight_id, clip_index, start_time, end_time, reason) VALUES (?, ?, ?, ?, ?)');

            // Create parent highlight record
            const hlResult = db.prepare("INSERT INTO highlights (video_id, status) VALUES (?, 'pending')").run(videoId);
            const hlId = hlResult.lastInsertRowid;

            analysisResult.highlights.forEach((h, i) => {
                insertHighlight.run(hlId, i, h.start_time, h.end_time, h.reason);
            });

            highlightsToRender = { id: hlId, clips: analysisResult.highlights };
        }

        // Step 4: Render Highlight Video
        if (highlightsToRender && highlightsToRender.clips && highlightsToRender.clips.length > 0) {
            console.log('Step 4: Rendering Highlight Video...');
            try {
                db.prepare("UPDATE highlights SET status = 'generating' WHERE id = ?").run(highlightsToRender.id);
                const highlightPath = await createHighlightVideo(video.file_path, highlightsToRender.clips, videoId);
                db.prepare("UPDATE highlights SET status = 'completed', file_path = ? WHERE id = ?").run(highlightPath, highlightsToRender.id);
                console.log('Highlight video generated:', highlightPath);
            } catch (hlError) {
                console.error('Highlight rendering failed:', hlError);
                db.prepare("UPDATE highlights SET status = 'failed' WHERE id = ?").run(highlightsToRender.id);
            }
        }

        // Complete
        updateVideoStatus(videoId, 'completed');
        console.log(`Video ${videoId} processing complete.`);

    } catch (error) {
        console.error(`Fatal error processing video ${videoId}:`, error);
        updateVideoStatus(videoId, 'failed', error.message);
    }
}

/**
 * Update video processing status
 */
function updateVideoStatus(videoId, status, errorMessage = null) {
    const db = getDatabase();
    db.prepare(`
    UPDATE videos SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, errorMessage, videoId);
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
