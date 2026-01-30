import path from 'path';
import fs from 'fs';
import { getDatabase } from '../config/database.js';
import { addToQueue, getQueueStatus } from '../services/processingQueue.js';
import { generateFilename } from '../utils/helpers.js';

const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || './storage/videos';

/**
 * Upload a new video
 */
export async function uploadVideo(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No video file provided' });
        }

        const db = getDatabase();
        const originalName = req.file.originalname;
        const fileSize = req.file.size;

        // Check for duplicate (same name and size)
        const existing = await db.get(
            `SELECT id, status FROM videos 
             WHERE original_name = $1 AND file_size = $2 
             ORDER BY created_at DESC LIMIT 1`,
            [originalName, fileSize]
        );

        if (existing) {
            // Delete uploaded temp file
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.status(200).json({
                success: true,
                data: {
                    id: existing.id,
                    originalName,
                    status: existing.status,
                    message: 'Video already exists, returning existing record',
                    isDuplicate: true
                }
            });
        }

        const filename = generateFilename(originalName);
        const filePath = path.join(VIDEO_STORAGE_PATH, filename);

        // Ensure directory exists
        if (!fs.existsSync(VIDEO_STORAGE_PATH)) {
            fs.mkdirSync(VIDEO_STORAGE_PATH, { recursive: true });
        }

        // Move file to storage
        fs.renameSync(req.file.path, filePath);

        // Insert into database
        const result = await db.run(
            `INSERT INTO videos (filename, original_name, file_path, file_size, status)
             VALUES ($1, $2, $3, $4, 'uploaded')`,
            [filename, originalName, filePath, fileSize]
        );

        const videoId = result.lastInsertRowid;

        // Add to processing queue
        addToQueue(videoId);

        res.status(201).json({
            success: true,
            data: {
                id: videoId,
                filename,
                originalName,
                status: 'uploaded',
                message: 'Video uploaded and queued for processing'
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Get all videos
 */
export async function getAllVideos(req, res) {
    try {
        const db = getDatabase();
        const videos = await db.all(`
            SELECT id, filename, original_name, duration_seconds, file_size, status, created_at, updated_at
            FROM videos
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            data: videos.map(v => ({
                id: v.id,
                filename: v.filename,
                originalName: v.original_name,
                duration: v.duration_seconds,
                fileSize: v.file_size,
                status: v.status,
                createdAt: v.created_at,
                updatedAt: v.updated_at
            }))
        });
    } catch (error) {
        console.error('Get videos error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Get single video details
 */
export async function getVideo(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const video = await db.get('SELECT * FROM videos WHERE id = $1', [id]);

        if (!video) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        // Check what data is available
        const transcriptCount = await db.get('SELECT COUNT(*) as count FROM transcripts WHERE video_id = $1', [id]);
        const summaryCount = await db.get('SELECT COUNT(*) as count FROM summaries WHERE video_id = $1', [id]);
        const chapterCount = await db.get('SELECT COUNT(*) as count FROM chapters WHERE video_id = $1', [id]);
        const noteCount = await db.get('SELECT COUNT(*) as count FROM notes WHERE video_id = $1', [id]);
        const todoCount = await db.get('SELECT COUNT(*) as count FROM todos WHERE video_id = $1', [id]);
        const highlight = await db.get('SELECT * FROM highlights WHERE video_id = $1', [id]);

        res.json({
            success: true,
            data: {
                id: video.id,
                filename: video.filename,
                originalName: video.original_name,
                duration: video.duration_seconds,
                fileSize: video.file_size,
                status: video.status,
                errorMessage: video.error_message,
                createdAt: video.created_at,
                updatedAt: video.updated_at,
                hasTranscript: parseInt(transcriptCount.count) > 0,
                hasSummary: parseInt(summaryCount.count) > 0,
                hasChapters: parseInt(chapterCount.count) > 0,
                hasNotes: parseInt(noteCount.count) > 0,
                hasTodos: parseInt(todoCount.count) > 0,
                hasHighlights: highlight?.status === 'completed'
            }
        });
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Get video processing status
 */
export async function getVideoStatus(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const video = await db.get('SELECT id, status, error_message, updated_at FROM videos WHERE id = $1', [id]);

        if (!video) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        const queueStatus = getQueueStatus();

        res.json({
            success: true,
            data: {
                id: video.id,
                status: video.status,
                errorMessage: video.error_message,
                updatedAt: video.updated_at,
                queuePosition: queueStatus.queue.indexOf(Number(id)) + 1 || null,
                isCurrentlyProcessing: queueStatus.isProcessing && !queueStatus.queue.includes(Number(id)) && video.status !== 'completed' && video.status !== 'failed'
            }
        });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Stream video file
 */
export async function streamVideo(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const video = await db.get('SELECT file_path FROM videos WHERE id = $1', [id]);

        if (!video || !fs.existsSync(video.file_path)) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        const stat = fs.statSync(video.file_path);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(video.file_path, { start, end });

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4'
            });

            file.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4'
            });
            fs.createReadStream(video.file_path).pipe(res);
        }
    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Delete a video
 */
export async function deleteVideo(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const video = await db.get('SELECT file_path FROM videos WHERE id = $1', [id]);

        if (!video) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        // Delete file if exists
        if (fs.existsSync(video.file_path)) {
            fs.unlinkSync(video.file_path);
        }

        // Delete from database (cascade will handle related records)
        await db.run('DELETE FROM videos WHERE id = $1', [id]);

        res.json({ success: true, message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

export default { uploadVideo, getAllVideos, getVideo, getVideoStatus, streamVideo, deleteVideo };
