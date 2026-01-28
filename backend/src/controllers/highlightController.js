import fs from 'fs';
import { getDatabase } from '../config/database.js';
import { createHighlightVideo } from '../services/ffmpegService.js';

/**
 * Get highlight video info
 */
export function getHighlights(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const highlight = db.prepare(`
      SELECT h.*, v.file_path as video_path
      FROM highlights h
      JOIN videos v ON h.video_id = v.id
      WHERE h.video_id = ?
    `).get(id);

        if (!highlight) {
            return res.status(404).json({ success: false, error: 'No highlights found for this video' });
        }

        const clips = db.prepare(`
      SELECT clip_index, start_time, end_time, reason
      FROM highlight_clips
      WHERE highlight_id = ?
      ORDER BY clip_index
    `).all(highlight.id);

        res.json({
            success: true,
            data: {
                videoId: parseInt(id),
                status: highlight.status,
                filePath: highlight.file_path,
                clips: clips.map(c => ({
                    index: c.clip_index,
                    startTime: c.start_time,
                    endTime: c.end_time,
                    reason: c.reason
                })),
                createdAt: highlight.created_at
            }
        });
    } catch (error) {
        console.error('Get highlights error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Stream highlight video
 */
export function streamHighlight(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const highlight = db.prepare(`
      SELECT file_path, status
      FROM highlights
      WHERE video_id = ? AND status = 'completed'
    `).get(id);

        if (!highlight || !highlight.file_path || !fs.existsSync(highlight.file_path)) {
            return res.status(404).json({ success: false, error: 'Highlight video not found' });
        }

        const stat = fs.statSync(highlight.file_path);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(highlight.file_path, { start, end });

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
            fs.createReadStream(highlight.file_path).pipe(res);
        }
    } catch (error) {
        console.error('Stream highlight error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Regenerate highlight video
 */
export async function regenerateHighlight(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
        if (!video) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        const highlight = db.prepare('SELECT * FROM highlights WHERE video_id = ?').get(id);
        if (!highlight) {
            return res.status(404).json({ success: false, error: 'No highlight data found' });
        }

        const clips = db.prepare(`
      SELECT start_time, end_time, reason
      FROM highlight_clips
      WHERE highlight_id = ?
      ORDER BY clip_index
    `).all(highlight.id);

        if (clips.length === 0) {
            return res.status(400).json({ success: false, error: 'No highlight clips defined' });
        }

        // Update status
        db.prepare('UPDATE highlights SET status = ? WHERE id = ?').run('generating', highlight.id);

        // Generate in background
        res.json({
            success: true,
            data: {
                message: 'Highlight regeneration started',
                status: 'generating'
            }
        });

        // Async generation
        try {
            const highlightPath = await createHighlightVideo(video.file_path, clips, id);
            db.prepare('UPDATE highlights SET status = ?, file_path = ? WHERE id = ?')
                .run('completed', highlightPath, highlight.id);
        } catch (error) {
            console.error('Highlight generation failed:', error);
            db.prepare('UPDATE highlights SET status = ? WHERE id = ?').run('failed', highlight.id);
        }
    } catch (error) {
        console.error('Regenerate highlight error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Get highlight generation status
 */
export function getHighlightStatus(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const highlight = db.prepare(`
      SELECT status, created_at
      FROM highlights
      WHERE video_id = ?
    `).get(id);

        if (!highlight) {
            return res.status(404).json({ success: false, error: 'No highlights found' });
        }

        res.json({
            success: true,
            data: {
                videoId: parseInt(id),
                status: highlight.status,
                createdAt: highlight.created_at
            }
        });
    } catch (error) {
        console.error('Get highlight status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

export default { getHighlights, streamHighlight, regenerateHighlight, getHighlightStatus };
