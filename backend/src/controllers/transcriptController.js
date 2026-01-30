import { getDatabase } from '../config/database.js';

/**
 * Get full transcript for a video
 */
export async function getTranscript(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        // Verify video exists
        const video = await db.get('SELECT id, original_name FROM videos WHERE id = $1', [id]);
        if (!video) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        const segments = await db.all(`
            SELECT id, segment_index, start_time, end_time, text, confidence
            FROM transcripts
            WHERE video_id = $1
            ORDER BY segment_index
        `, [id]);

        const fullText = segments.map(s => s.text).join(' ');

        res.json({
            success: true,
            data: {
                videoId: video.id,
                videoName: video.original_name,
                segments: segments.map(s => ({
                    id: s.id,
                    index: s.segment_index,
                    startTime: s.start_time,
                    endTime: s.end_time,
                    text: s.text,
                    confidence: s.confidence
                })),
                fullText,
                totalSegments: segments.length
            }
        });
    } catch (error) {
        console.error('Get transcript error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Get transcript segment at specific timestamp
 */
export async function getTranscriptAtTime(req, res) {
    try {
        const { id } = req.params;
        const { time } = req.query;

        if (!time) {
            return res.status(400).json({ success: false, error: 'Time parameter required' });
        }

        const timestamp = parseFloat(time);
        const db = getDatabase();

        const segment = await db.get(`
            SELECT id, segment_index, start_time, end_time, text
            FROM transcripts
            WHERE video_id = $1 AND start_time <= $2 AND end_time >= $2
            ORDER BY start_time
            LIMIT 1
        `, [id, timestamp]);

        if (!segment) {
            // Get nearest segment
            const nearest = await db.get(`
                SELECT id, segment_index, start_time, end_time, text
                FROM transcripts
                WHERE video_id = $1
                ORDER BY ABS(start_time - $2)
                LIMIT 1
            `, [id, timestamp]);

            if (!nearest) {
                return res.status(404).json({ success: false, error: 'No transcript found' });
            }

            return res.json({
                success: true,
                data: {
                    ...nearest,
                    exact: false
                }
            });
        }

        res.json({
            success: true,
            data: {
                id: segment.id,
                index: segment.segment_index,
                startTime: segment.start_time,
                endTime: segment.end_time,
                text: segment.text,
                exact: true
            }
        });
    } catch (error) {
        console.error('Get transcript at time error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Get video summary
 */
export async function getSummary(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const summary = await db.get(`
            SELECT full_summary, brief_summary, created_at
            FROM summaries
            WHERE video_id = $1
        `, [id]);

        if (!summary) {
            return res.status(404).json({ success: false, error: 'Summary not found' });
        }

        res.json({
            success: true,
            data: {
                videoId: parseInt(id),
                fullSummary: summary.full_summary,
                briefSummary: summary.brief_summary,
                createdAt: summary.created_at
            }
        });
    } catch (error) {
        console.error('Get summary error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Get key notes
 */
export async function getNotes(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const notes = await db.all(`
            SELECT id, note_index, content, start_time, end_time
            FROM notes
            WHERE video_id = $1
            ORDER BY note_index
        `, [id]);

        res.json({
            success: true,
            data: {
                videoId: parseInt(id),
                notes: notes.map(n => ({
                    id: n.id,
                    index: n.note_index,
                    content: n.content,
                    startTime: n.start_time,
                    endTime: n.end_time
                })),
                total: notes.length
            }
        });
    } catch (error) {
        console.error('Get notes error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Get action items / todos
 */
export async function getTodos(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const todos = await db.all(`
            SELECT id, todo_index, content, priority, completed, start_time
            FROM todos
            WHERE video_id = $1
            ORDER BY todo_index
        `, [id]);

        res.json({
            success: true,
            data: {
                videoId: parseInt(id),
                todos: todos.map(t => ({
                    id: t.id,
                    index: t.todo_index,
                    content: t.content,
                    priority: t.priority,
                    completed: Boolean(t.completed),
                    startTime: t.start_time
                })),
                total: todos.length
            }
        });
    } catch (error) {
        console.error('Get todos error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Toggle todo completion
 */
export async function toggleTodo(req, res) {
    try {
        const { id, todoId } = req.params;
        const db = getDatabase();

        const todo = await db.get('SELECT * FROM todos WHERE id = $1 AND video_id = $2', [todoId, id]);

        if (!todo) {
            return res.status(404).json({ success: false, error: 'Todo not found' });
        }

        const newCompleted = !todo.completed;
        await db.run('UPDATE todos SET completed = $1 WHERE id = $2', [newCompleted, todoId]);

        res.json({
            success: true,
            data: {
                id: parseInt(todoId),
                completed: newCompleted
            }
        });
    } catch (error) {
        console.error('Toggle todo error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Get chapters
 */
export async function getChapters(req, res) {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const chapters = await db.all(`
            SELECT id, chapter_index, title, summary, start_time, end_time
            FROM chapters
            WHERE video_id = $1
            ORDER BY chapter_index
        `, [id]);

        res.json({
            success: true,
            data: {
                videoId: parseInt(id),
                chapters: chapters.map(c => ({
                    id: c.id,
                    index: c.chapter_index,
                    title: c.title,
                    summary: c.summary,
                    startTime: c.start_time,
                    endTime: c.end_time
                })),
                total: chapters.length
            }
        });
    } catch (error) {
        console.error('Get chapters error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

export default {
    getTranscript,
    getTranscriptAtTime,
    getSummary,
    getNotes,
    getTodos,
    toggleTodo,
    getChapters
};
