-- AI Video Intelligence Platform - SQLite Schema
-- Enable FTS5 for full-text search

-- Main videos table
CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    duration_seconds REAL,
    file_size INTEGER,
    status TEXT DEFAULT 'uploaded' CHECK(status IN ('uploaded', 'processing', 'transcribing', 'analyzing', 'embedding', 'completed', 'failed')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transcript segments with timestamps
CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    segment_index INTEGER NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    text TEXT NOT NULL,
    confidence REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Full-text search on transcripts
CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(
    text,
    content='transcripts',
    content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS transcripts_ai AFTER INSERT ON transcripts BEGIN
    INSERT INTO transcripts_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS transcripts_ad AFTER DELETE ON transcripts BEGIN
    INSERT INTO transcripts_fts(transcripts_fts, rowid, text) VALUES('delete', old.id, old.text);
END;

CREATE TRIGGER IF NOT EXISTS transcripts_au AFTER UPDATE ON transcripts BEGIN
    INSERT INTO transcripts_fts(transcripts_fts, rowid, text) VALUES('delete', old.id, old.text);
    INSERT INTO transcripts_fts(rowid, text) VALUES (new.id, new.text);
END;

-- Video summaries
CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL UNIQUE,
    full_summary TEXT NOT NULL,
    brief_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Key notes
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    note_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    start_time REAL,
    end_time REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Action items / TODOs
CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    todo_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    completed INTEGER DEFAULT 0,
    start_time REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Chapters
CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Embeddings metadata (vectors stored in FAISS)
CREATE TABLE IF NOT EXISTS embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    transcript_id INTEGER NOT NULL,
    faiss_index INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
);

-- Highlights
CREATE TABLE IF NOT EXISTS highlights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    file_path TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'generating', 'completed', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Highlight clips (segments that make up a highlight video)
CREATE TABLE IF NOT EXISTS highlight_clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    highlight_id INTEGER NOT NULL,
    clip_index INTEGER NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    reason TEXT,
    FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transcripts_video ON transcripts(video_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_time ON transcripts(video_id, start_time);
CREATE INDEX IF NOT EXISTS idx_notes_video ON notes(video_id);
CREATE INDEX IF NOT EXISTS idx_todos_video ON todos(video_id);
CREATE INDEX IF NOT EXISTS idx_chapters_video ON chapters(video_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_video ON embeddings(video_id);
