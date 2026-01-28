import axios from 'axios';

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:5001';

/**
 * Generate embeddings for text segments
 * @param {Array<{id: number, text: string}>} segments - Segments to embed
 * @returns {Promise<Array<{id: number, embedding: number[]}>>}
 */
export async function generateEmbeddings(segments) {
    try {
        console.log(`Generating embeddings for ${segments.length} segments`);

        const response = await axios.post(
            `${EMBEDDING_SERVICE_URL}/embed`,
            { segments },
            {
                timeout: 300000, // 5 minute timeout
                headers: { 'Content-Type': 'application/json' }
            }
        );

        if (response.data.error) {
            throw new Error(response.data.error);
        }

        console.log(`Embeddings generated successfully`);
        return response.data.embeddings;
    } catch (error) {
        console.error('Embedding service error:', error.message);
        throw error;
    }
}

/**
 * Add embeddings to FAISS index
 * @param {number} videoId - Video ID
 * @param {Array<{id: number, embedding: number[]}>} embeddings
 */
export async function indexEmbeddings(videoId, embeddings) {
    try {
        const response = await axios.post(
            `${EMBEDDING_SERVICE_URL}/index`,
            { video_id: videoId, embeddings },
            {
                timeout: 60000,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        return response.data;
    } catch (error) {
        console.error('FAISS indexing error:', error.message);
        throw error;
    }
}

/**
 * Search for similar segments using semantic search
 * @param {string} query - Search query
 * @param {number} videoId - Optional video ID to restrict search
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array<{transcript_id: number, similarity: number}>>}
 */
export async function searchSemantic(query, videoId = null, topK = 10) {
    try {
        const response = await axios.post(
            `${EMBEDDING_SERVICE_URL}/search`,
            { query, video_id: videoId, top_k: topK },
            {
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        if (response.data.error) {
            throw new Error(response.data.error);
        }

        return response.data.results;
    } catch (error) {
        console.error('Semantic search error:', error.message);
        throw error;
    }
}

/**
 * Check if embedding service is available
 */
export async function checkEmbeddingHealth() {
    try {
        const response = await axios.get(`${EMBEDDING_SERVICE_URL}/health`, { timeout: 5000 });
        return response.data.status === 'ok';
    } catch {
        return false;
    }
}

export default { generateEmbeddings, indexEmbeddings, searchSemantic, checkEmbeddingHealth };
