-- PostgreSQL Schema for AI Video Intelligence Platform
-- Requires: pgvector extension

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    duration_seconds REAL,
    file_size BIGINT,
    status VARCHAR(50) DEFAULT 'uploaded' 
        CHECK(status IN ('uploaded', 'processing', 'transcribing', 'analyzing', 'embedding', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transcripts with embedded vectors (768 dimensions for nomic-embed-text)
CREATE TABLE IF NOT EXISTS transcripts (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    text TEXT NOT NULL,
    confidence REAL,
    embedding vector(768),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search index using GIN
CREATE INDEX IF NOT EXISTS idx_transcripts_fts ON transcripts USING GIN (to_tsvector('english', text));

-- Vector similarity index (HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_transcripts_embedding ON transcripts USING hnsw (embedding vector_cosine_ops);

-- Summaries
CREATE TABLE IF NOT EXISTS summaries (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
    full_summary TEXT NOT NULL,
    brief_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notes (includes keywords)
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    note_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    start_time REAL,
    end_time REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Todos / Action items
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    todo_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    priority VARCHAR(10) DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    completed BOOLEAN DEFAULT FALSE,
    start_time REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chapters
CREATE TABLE IF NOT EXISTS chapters (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    chapter_index INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Highlights (container for highlight clips)
CREATE TABLE IF NOT EXISTS highlights (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    file_path TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'generating', 'completed', 'failed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Highlight clips (individual clips within a highlight video)
CREATE TABLE IF NOT EXISTS highlight_clips (
    id SERIAL PRIMARY KEY,
    highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    clip_index INTEGER NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    category VARCHAR(50),
    reason TEXT,
    transcript_excerpt TEXT
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_transcripts_video ON transcripts(video_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_time ON transcripts(video_id, start_time);
CREATE INDEX IF NOT EXISTS idx_notes_video ON notes(video_id);
CREATE INDEX IF NOT EXISTS idx_todos_video ON todos(video_id);
CREATE INDEX IF NOT EXISTS idx_chapters_video ON chapters(video_id);
CREATE INDEX IF NOT EXISTS idx_highlights_video ON highlights(video_id);
