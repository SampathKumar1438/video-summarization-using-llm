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
        const filename = generateFilename(originalName);
        const filePath = path.join(VIDEO_STORAGE_PATH, filename);

        // Ensure directory exists
        if (!fs.existsSync(VIDEO_STORAGE_PATH)) {
            fs.mkdirSync(VIDEO_STORAGE_PATH, { recursive: true });
        }

        // Move file to storage
        fs.renameSync(req.file.path, filePath);

        // Insert into database
        const result = db.prepare(`
      INSERT INTO videos (filename, original_name, file_path, file_size, status)
      VALUES (?, ?, ?, ?, 'uploaded')
    `).run(filename, originalName, filePath, req.file.size);

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
export function getAllVideos(req, res) {
    try {
        const db = getDatabase();
        const videos = db.prepare(`
      SELECT id, filename, original_name, duration_seconds, file_size, status, created_at, updated_at
      FROM videos
      ORDER BY created_at DESC
    `).all();

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
export function getVideo(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);

        if (!video) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        // Check what data is available
        const hasTranscript = db.prepare('SELECT COUNT(*) as count FROM transcripts WHERE video_id = ?').get(id).count > 0;
        const hasSummary = db.prepare('SELECT COUNT(*) as count FROM summaries WHERE video_id = ?').get(id).count > 0;
        const hasChapters = db.prepare('SELECT COUNT(*) as count FROM chapters WHERE video_id = ?').get(id).count > 0;
        const hasNotes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE video_id = ?').get(id).count > 0;
        const hasTodos = db.prepare('SELECT COUNT(*) as count FROM todos WHERE video_id = ?').get(id).count > 0;
        const highlight = db.prepare('SELECT * FROM highlights WHERE video_id = ?').get(id);

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
                hasTranscript,
                hasSummary,
                hasChapters,
                hasNotes,
                hasTodos,
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
export function getVideoStatus(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const video = db.prepare('SELECT id, status, error_message, updated_at FROM videos WHERE id = ?').get(id);

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
export function streamVideo(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const video = db.prepare('SELECT file_path FROM videos WHERE id = ?').get(id);

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
export function deleteVideo(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const video = db.prepare('SELECT file_path FROM videos WHERE id = ?').get(id);

        if (!video) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        // Delete file if exists
        if (fs.existsSync(video.file_path)) {
            fs.unlinkSync(video.file_path);
        }

        // Delete from database (cascade will handle related records)
        db.prepare('DELETE FROM videos WHERE id = ?').run(id);

        res.json({ success: true, message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

export default { uploadVideo, getAllVideos, getVideo, getVideoStatus, streamVideo, deleteVideo };
