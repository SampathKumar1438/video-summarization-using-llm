import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import database
import { initDatabase } from './config/database.js';

// Import routes
import videoRoutes from './routes/videos.js';
import transcriptRoutes from './routes/transcripts.js';
import searchRoutes, { videoSearchRouter } from './routes/search.js';
import highlightRoutes from './routes/highlights.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/v1/videos', videoRoutes);
app.use('/api/v1/videos', transcriptRoutes);
app.use('/api/v1/videos/:id/search', videoSearchRouter);
app.use('/api/v1/videos/:id/highlights', highlightRoutes);
app.use('/api/v1/search', searchRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            error: 'File too large. Maximum size is 5GB.'
        });
    }

    if (err.message.includes('Invalid file type')) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }

    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
    try {
        console.log('Initializing database...');
        console.log('LLM Config:', {
            url: process.env.LLM_SERVICE_URL || 'default',
            model: process.env.LLM_MODEL || 'default'
        });
        await initDatabase();
        console.log('Database initialized');

        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════════╗
║     AI Video Intelligence Platform - Backend Server      ║
╠══════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                 ║
║  API Base URL: http://localhost:${PORT}/api/v1               ║
╚══════════════════════════════════════════════════════════╝
  `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;
