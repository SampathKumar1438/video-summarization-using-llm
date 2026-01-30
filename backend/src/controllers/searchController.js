import { getDatabase } from '../config/database.js';
import { searchSemantic } from '../services/embeddingService.js';

/**
 * Keyword search across all videos or specific video
 * Uses PostgreSQL full-text search with to_tsvector
 */
export async function keywordSearch(req, res) {
    try {
        const { q, videoId, limit = 50 } = req.query;

        if (!q) {
            return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
        }

        const db = getDatabase();
        const searchQuery = q.split(' ').join(' & '); // Convert to tsquery format
        const limitNum = parseInt(limit);

        let sql, params;

        if (videoId) {
            sql = `
                SELECT * FROM (
                    -- Chapters
                    SELECT 
                        'chapter' as type,
                        c.video_id,
                        v.original_name as video_name,
                        c.id as source_id,
                        c.title || ': ' || COALESCE(c.summary, '') as text,
                        c.start_time,
                        c.end_time,
                        1 as rank_priority,
                        ts_rank(to_tsvector('english', c.title || ' ' || COALESCE(c.summary, '')), plainto_tsquery('english', $1)) as rank
                    FROM chapters c
                    JOIN videos v ON c.video_id = v.id
                    WHERE to_tsvector('english', c.title || ' ' || COALESCE(c.summary, '')) @@ plainto_tsquery('english', $1)
                    AND c.video_id = $2

                    UNION ALL

                    -- Summaries
                    SELECT 
                        'summary' as type,
                        s.video_id,
                        v.original_name as video_name,
                        s.id as source_id,
                        COALESCE(s.brief_summary, '') || ' ' || s.full_summary as text,
                        0 as start_time,
                        0 as end_time,
                        2 as rank_priority,
                        ts_rank(to_tsvector('english', COALESCE(s.brief_summary, '') || ' ' || s.full_summary), plainto_tsquery('english', $1)) as rank
                    FROM summaries s
                    JOIN videos v ON s.video_id = v.id
                    WHERE to_tsvector('english', COALESCE(s.brief_summary, '') || ' ' || s.full_summary) @@ plainto_tsquery('english', $1)
                    AND s.video_id = $2

                    UNION ALL

                    -- Notes
                    SELECT 
                        'note' as type,
                        n.video_id,
                        v.original_name as video_name,
                        n.id as source_id,
                        n.content as text,
                        n.start_time,
                        n.end_time,
                        3 as rank_priority,
                        ts_rank(to_tsvector('english', n.content), plainto_tsquery('english', $1)) as rank
                    FROM notes n
                    JOIN videos v ON n.video_id = v.id
                    WHERE to_tsvector('english', n.content) @@ plainto_tsquery('english', $1)
                    AND n.video_id = $2

                    UNION ALL

                    -- Transcripts
                    SELECT 
                        'transcript' as type,
                        t.video_id,
                        v.original_name as video_name,
                        t.id as source_id,
                        t.text,
                        t.start_time,
                        t.end_time,
                        4 as rank_priority,
                        ts_rank(to_tsvector('english', t.text), plainto_tsquery('english', $1)) as rank
                    FROM transcripts t
                    JOIN videos v ON t.video_id = v.id
                    WHERE to_tsvector('english', t.text) @@ plainto_tsquery('english', $1)
                    AND t.video_id = $2
                ) combined_results
                ORDER BY rank_priority ASC, rank DESC, start_time ASC
                LIMIT $3
            `;
            params = [q, videoId, limitNum];
        } else {
            sql = `
                SELECT * FROM (
                    -- Chapters
                    SELECT 
                        'chapter' as type,
                        c.video_id,
                        v.original_name as video_name,
                        c.id as source_id,
                        c.title || ': ' || COALESCE(c.summary, '') as text,
                        c.start_time,
                        c.end_time,
                        1 as rank_priority,
                        ts_rank(to_tsvector('english', c.title || ' ' || COALESCE(c.summary, '')), plainto_tsquery('english', $1)) as rank
                    FROM chapters c
                    JOIN videos v ON c.video_id = v.id
                    WHERE to_tsvector('english', c.title || ' ' || COALESCE(c.summary, '')) @@ plainto_tsquery('english', $1)

                    UNION ALL

                    -- Summaries
                    SELECT 
                        'summary' as type,
                        s.video_id,
                        v.original_name as video_name,
                        s.id as source_id,
                        COALESCE(s.brief_summary, '') || ' ' || s.full_summary as text,
                        0 as start_time,
                        0 as end_time,
                        2 as rank_priority,
                        ts_rank(to_tsvector('english', COALESCE(s.brief_summary, '') || ' ' || s.full_summary), plainto_tsquery('english', $1)) as rank
                    FROM summaries s
                    JOIN videos v ON s.video_id = v.id
                    WHERE to_tsvector('english', COALESCE(s.brief_summary, '') || ' ' || s.full_summary) @@ plainto_tsquery('english', $1)

                    UNION ALL

                    -- Notes
                    SELECT 
                        'note' as type,
                        n.video_id,
                        v.original_name as video_name,
                        n.id as source_id,
                        n.content as text,
                        n.start_time,
                        n.end_time,
                        3 as rank_priority,
                        ts_rank(to_tsvector('english', n.content), plainto_tsquery('english', $1)) as rank
                    FROM notes n
                    JOIN videos v ON n.video_id = v.id
                    WHERE to_tsvector('english', n.content) @@ plainto_tsquery('english', $1)

                    UNION ALL

                    -- Transcripts
                    SELECT 
                        'transcript' as type,
                        t.video_id,
                        v.original_name as video_name,
                        t.id as source_id,
                        t.text,
                        t.start_time,
                        t.end_time,
                        4 as rank_priority,
                        ts_rank(to_tsvector('english', t.text), plainto_tsquery('english', $1)) as rank
                    FROM transcripts t
                    JOIN videos v ON t.video_id = v.id
                    WHERE to_tsvector('english', t.text) @@ plainto_tsquery('english', $1)
                ) combined_results
                ORDER BY rank_priority ASC, rank DESC, start_time ASC
                LIMIT $2
            `;
            params = [q, limitNum];
        }

        const results = await db.all(sql, params);

        res.json({
            success: true,
            data: {
                query: q,
                results: results.map(r => ({
                    type: r.type,
                    videoId: r.video_id,
                    videoName: r.video_name,
                    sourceId: r.source_id,
                    text: r.text.length > 200 ? r.text.substring(0, 200) + '...' : r.text,
                    startTime: r.start_time,
                    endTime: r.end_time,
                    rank: r.rank_priority
                })),
                total: results.length
            }
        });
    } catch (error) {
        console.error('Keyword search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Semantic search using pgvector
 */
export async function semanticSearch(req, res) {
    try {
        const { q, videoId, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
        }

        // Get semantic search results from pgvector
        const searchResults = await searchSemantic(q, videoId || null, parseInt(limit));

        if (!searchResults || searchResults.length === 0) {
            return res.json({
                success: true,
                data: {
                    query: q,
                    results: [],
                    total: 0
                }
            });
        }

        // Get transcript details for the results
        const db = getDatabase();
        const transcriptIds = searchResults.map(r => r.transcript_id);
        const placeholders = transcriptIds.map((_, i) => `$${i + 1}`).join(',');

        const transcripts = await db.all(`
            SELECT 
                t.id,
                t.video_id,
                v.original_name as video_name,
                t.start_time,
                t.end_time,
                t.text
            FROM transcripts t
            JOIN videos v ON t.video_id = v.id
            WHERE t.id IN (${placeholders})
        `, transcriptIds);

        // Create a map for easy lookup
        const transcriptMap = new Map(transcripts.map(t => [t.id, t]));

        // Combine with similarity scores
        const results = searchResults
            .map(r => {
                const transcript = transcriptMap.get(r.transcript_id);
                if (!transcript) return null;
                return {
                    videoId: transcript.video_id,
                    videoName: transcript.video_name,
                    transcriptId: transcript.id,
                    text: transcript.text,
                    startTime: transcript.start_time,
                    endTime: transcript.end_time,
                    similarity: r.similarity
                };
            })
            .filter(Boolean);

        res.json({
            success: true,
            data: {
                query: q,
                results,
                total: results.length
            }
        });
    } catch (error) {
        console.error('Semantic search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Keyword search within specific video
 */
export async function keywordSearchInVideo(req, res) {
    req.query.videoId = req.params.id;
    return keywordSearch(req, res);
}

/**
 * Semantic search within specific video
 */
export async function semanticSearchInVideo(req, res) {
    req.query.videoId = req.params.id;
    return semanticSearch(req, res);
}

export default { keywordSearch, semanticSearch, keywordSearchInVideo, semanticSearchInVideo };
