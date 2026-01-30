import axios from 'axios';
import { getDatabase } from '../config/database.js';

// LLM API for embeddings (Ollama)
const LLM_BASE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';

/**
 * Generate embeddings for text segments using LLM
 * @param {Array<{id: number, text: string}>} segments - Segments to embed
 * @returns {Promise<Array<{id: number, embedding: number[]}>>}
 */
export async function generateEmbeddings(segments) {
    try {
        console.log(`Generating embeddings for ${segments.length} segments using ${EMBEDDING_MODEL}`);

        const embeddings = [];

        // Process in batches to avoid timeouts
        const batchSize = 10;
        for (let i = 0; i < segments.length; i += batchSize) {
            const batch = segments.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(async (segment) => {
                    try {
                        const response = await axios.post(
                            `${LLM_BASE_URL}/api/embeddings`,
                            {
                                model: EMBEDDING_MODEL,
                                prompt: segment.text
                            },
                            {
                                timeout: 60000,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );

                        return {
                            id: segment.id,
                            embedding: response.data.embedding
                        };
                    } catch (error) {
                        console.error(`Failed to embed segment ${segment.id}:`, error.message);
                        return { id: segment.id, embedding: null };
                    }
                })
            );

            embeddings.push(...batchResults.filter(e => e.embedding !== null));

            // Progress logging
            console.log(`Embedded ${Math.min(i + batchSize, segments.length)}/${segments.length} segments`);
        }

        console.log(`Successfully generated ${embeddings.length} embeddings`);
        return embeddings;
    } catch (error) {
        console.error('Embedding generation error:', error.message);
        throw error;
    }
}

/**
 * Store embeddings in PostgreSQL (pgvector)
 * @param {number} videoId - Video ID
 * @param {number} transcriptId - Transcript segment ID
 * @param {number[]} embedding - Embedding vector
 */
export async function storeEmbedding(transcriptId, embedding) {
    try {
        const db = getDatabase();

        // Format embedding as PostgreSQL vector string
        const vectorStr = `[${embedding.join(',')}]`;

        await db.run(
            'UPDATE transcripts SET embedding = $1 WHERE id = $2',
            [vectorStr, transcriptId]
        );
    } catch (error) {
        console.error('Error storing embedding:', error.message);
        throw error;
    }
}

/**
 * Search for similar segments using pgvector cosine similarity
 * @param {string} query - Search query text
 * @param {number} videoId - Optional video ID to filter
 * @param {number} topK - Number of results
 * @returns {Promise<Array<{transcript_id: number, video_id: number, similarity: number}>>}
 */
export async function searchSemantic(query, videoId = null, topK = 10) {
    try {
        const db = getDatabase();

        // Generate embedding for the query
        const response = await axios.post(
            `${LLM_BASE_URL}/api/embeddings`,
            {
                model: EMBEDDING_MODEL,
                prompt: query
            },
            {
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const queryEmbedding = response.data.embedding;
        const vectorStr = `[${queryEmbedding.join(',')}]`;

        // Search using pgvector cosine similarity (1 - cosine_distance)
        let sql, params;

        if (videoId) {
            sql = `
                SELECT 
                    id as transcript_id,
                    video_id,
                    text,
                    start_time,
                    end_time,
                    1 - (embedding <=> $1::vector) as similarity
                FROM transcripts
                WHERE video_id = $2 AND embedding IS NOT NULL
                ORDER BY embedding <=> $1::vector
                LIMIT $3
            `;
            params = [vectorStr, videoId, topK];
        } else {
            sql = `
                SELECT 
                    id as transcript_id,
                    video_id,
                    text,
                    start_time,
                    end_time,
                    1 - (embedding <=> $1::vector) as similarity
                FROM transcripts
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> $1::vector
                LIMIT $2
            `;
            params = [vectorStr, topK];
        }

        const results = await db.all(sql, params);

        return results.map(r => ({
            transcript_id: r.transcript_id,
            video_id: r.video_id,
            similarity: parseFloat(r.similarity).toFixed(4)
        }));
    } catch (error) {
        console.error('Semantic search error:', error.message);
        throw error;
    }
}

/**
 * Check if embedding service (Ollama) is available
 */
export async function checkEmbeddingHealth() {
    try {
        const response = await axios.get(`${LLM_BASE_URL}/api/tags`, { timeout: 5000 });

        // Check if the embedding model is available
        const models = response.data.models || [];
        const hasEmbeddingModel = models.some(m => m.name.includes(EMBEDDING_MODEL));

        return response.status === 200;
    } catch {
        return false;
    }
}

export default { generateEmbeddings, storeEmbedding, searchSemantic, checkEmbeddingHealth };
