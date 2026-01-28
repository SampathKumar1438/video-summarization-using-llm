import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
    baseURL: API_URL,
    timeout: 60000,
});

// Videos
export const uploadVideo = async (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/videos/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
            if (onProgress) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                onProgress(percent);
            }
        },
    });
    return response.data;
};

export const getVideos = async () => {
    const response = await api.get('/videos');
    return response.data;
};

export const getVideo = async (id) => {
    const response = await api.get(`/videos/${id}`);
    return response.data;
};

export const getVideoStatus = async (id) => {
    const response = await api.get(`/videos/${id}/status`);
    return response.data;
};

export const deleteVideo = async (id) => {
    const response = await api.delete(`/videos/${id}`);
    return response.data;
};

export const getVideoStreamUrl = (id) => `${API_URL}/videos/${id}/stream`;

// Transcripts & Analysis
export const getTranscript = async (id) => {
    const response = await api.get(`/videos/${id}/transcript`);
    return response.data;
};

export const getSummary = async (id) => {
    const response = await api.get(`/videos/${id}/summary`);
    return response.data;
};

export const getNotes = async (id) => {
    const response = await api.get(`/videos/${id}/notes`);
    return response.data;
};

export const getTodos = async (id) => {
    const response = await api.get(`/videos/${id}/todos`);
    return response.data;
};

export const toggleTodo = async (videoId, todoId) => {
    const response = await api.patch(`/videos/${videoId}/todos/${todoId}`);
    return response.data;
};

export const getChapters = async (id) => {
    const response = await api.get(`/videos/${id}/chapters`);
    return response.data;
};

// Search
export const keywordSearch = async (query, videoId = null) => {
    const params = { q: query };
    if (videoId) params.videoId = videoId;
    const response = await api.get('/search/keyword', { params });
    return response.data;
};

export const semanticSearch = async (query, videoId = null) => {
    const params = { q: query };
    if (videoId) params.videoId = videoId;
    const response = await api.get('/search/semantic', { params });
    return response.data;
};

// Highlights
export const getHighlights = async (id) => {
    const response = await api.get(`/videos/${id}/highlights`);
    return response.data;
};

export const getHighlightStreamUrl = (id) => `${API_URL}/videos/${id}/highlights/stream`;

export default api;
