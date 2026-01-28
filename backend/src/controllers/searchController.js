import { getDatabase } from '../config/database.js';
import { searchSemantic } from '../services/embeddingService.js';

/**
 * Keyword search across all videos or specific video
 */
/**
 * Keyword search across all videos or specific video
 * Searches: Transcripts, Chapters, Summaries, Notes (Keywords)
 */
export async function keywordSearch(req, res) {
    try {
        const { q, videoId, limit = 50 } = req.query;

        if (!q) {
            return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
        }

        const db = getDatabase();
        const searchTerm = `%${q}%`;
        const params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];

        // Base query conditions
        let videoFilter = '';
        if (videoId) {
            videoFilter = 'AND t.video_id = ?'; // This needs to be adapted for each UNION
            // We will inject the videoId parameter for each sub-query
        }

        // We use UNION ALL to aggregate matches from different sources
        // Rank priorities: 
        // 1. Chapters (Title)
        // 2. Summaries
        // 3. Notes (Keywords/Key Points)
        // 4. Transcripts (Raw text)

        let query = `
        SELECT * FROM (
            -- 1. Chapters
            SELECT 
                'chapter' as type,
                c.video_id,
                v.original_name as video_name,
                c.id as source_id,
                c.title || ': ' || c.summary as text,
                c.start_time,
                c.end_time,
                1 as rank_priority
            FROM chapters c
            JOIN videos v ON c.video_id = v.id
            WHERE (c.title LIKE ? OR c.summary LIKE ?)
            ${videoId ? 'AND c.video_id = ?' : ''}

            UNION ALL

            -- 2. Summaries
            SELECT 
                'summary' as type,
                s.video_id,
                v.original_name as video_name,
                s.id as source_id,
                s.brief_summary || '\n' || s.full_summary as text,
                0 as start_time,
                0 as end_time,
                2 as rank_priority
            FROM summaries s
            JOIN videos v ON s.video_id = v.id
            WHERE (s.full_summary LIKE ? OR s.brief_summary LIKE ?)
            ${videoId ? 'AND s.video_id = ?' : ''}

            UNION ALL

            -- 3. Notes (includes Keywords)
            SELECT 
                'note' as type,
                n.video_id,
                v.original_name as video_name,
                n.id as source_id,
                n.content as text,
                n.start_time,
                n.end_time,
                3 as rank_priority
            FROM notes n
            JOIN videos v ON n.video_id = v.id
            WHERE n.content LIKE ?
            ${videoId ? 'AND n.video_id = ?' : ''}

            UNION ALL

            -- 4. Transcripts
            SELECT 
                'transcript' as type,
                t.video_id,
                v.original_name as video_name,
                t.id as source_id,
                t.text,
                t.start_time,
                t.end_time,
                4 as rank_priority
            FROM transcripts t
            JOIN videos v ON t.video_id = v.id
            WHERE t.text LIKE ?
            ${videoId ? 'AND t.video_id = ?' : ''}
        ) combined_results
        ORDER BY rank_priority ASC, start_time ASC
        LIMIT ?
        `;

        // params construction is tricky with dynamic videoId injection
        // Let's rebuild params cleanly
        const finalParams = [];

        // Chapters
        finalParams.push(searchTerm, searchTerm);
        if (videoId) finalParams.push(videoId);

        // Summaries
        finalParams.push(searchTerm, searchTerm);
        if (videoId) finalParams.push(videoId);

        // Notes
        finalParams.push(searchTerm);
        if (videoId) finalParams.push(videoId);

        // Transcripts
        finalParams.push(searchTerm);
        if (videoId) finalParams.push(videoId);

        // Limit
        finalParams.push(parseInt(limit));

        const results = db.prepare(query).all(...finalParams);

        res.json({
            success: true,
            data: {
                query: q,
                results: results.map(r => ({
                    type: r.type,
                    videoId: r.video_id,
                    videoName: r.video_name,
                    sourceId: r.source_id,
                    text: r.text.length > 200 ? r.text.substring(0, 200) + '...' : r.text, // Truncate long text
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
 * Semantic search across all videos or specific video
 */
export async function semanticSearch(req, res) {
    try {
        const { q, videoId, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
        }

        // Get semantic search results from embedding service
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
        const placeholders = transcriptIds.map(() => '?').join(',');

        const transcripts = db.prepare(`
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
    `).all(...transcriptIds);

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
