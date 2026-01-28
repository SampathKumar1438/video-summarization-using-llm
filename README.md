# AI Video Intelligence Platform

A Panopto-like AI video intelligence POC using open-source tools.

## Features

- ✅ Video upload and storage
- ✅ Automatic transcription with timestamps (Whisper)
- ✅ AI-generated summaries, notes, and action items (Mistral 7B)
- ✅ Automatic chapter generation
- ✅ Keyword search (SQLite FTS5)
- ✅ Semantic search (FAISS + sentence-transformers)
- ✅ Auto-generated highlight videos (FFmpeg)

## Tech Stack

| Component        | Technology                     |
| ---------------- | ------------------------------ |
| Frontend         | React + Vite                   |
| Backend          | Node.js + Express              |
| Database         | SQLite + FTS5                  |
| Vector Search    | FAISS                          |
| Transcription    | OpenAI Whisper (local)         |
| LLM              | Mistral 7B via llama.cpp       |
| Embeddings       | sentence-transformers (MiniLM) |
| Media Processing | FFmpeg                         |
| Containerization | Docker + Docker Compose        |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- 20GB+ free disk space
- 16GB+ RAM recommended

### Setup

1. Clone and download models:

```bash
# Download Mistral 7B model (required)
cd llm/models
wget https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf
```

2. Start all services:

```bash
docker-compose up --build
```

3. Access the application:

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

## API Endpoints

| Method | Endpoint                        | Description      |
| ------ | ------------------------------- | ---------------- |
| POST   | `/api/v1/videos/upload`         | Upload video     |
| GET    | `/api/v1/videos`                | List videos      |
| GET    | `/api/v1/videos/:id`            | Video details    |
| GET    | `/api/v1/videos/:id/transcript` | Get transcript   |
| GET    | `/api/v1/videos/:id/summary`    | Get summary      |
| GET    | `/api/v1/videos/:id/notes`      | Get notes        |
| GET    | `/api/v1/videos/:id/todos`      | Get action items |
| GET    | `/api/v1/videos/:id/chapters`   | Get chapters     |
| GET    | `/api/v1/search/keyword`        | Keyword search   |
| GET    | `/api/v1/search/semantic`       | Semantic search  |
| GET    | `/api/v1/videos/:id/highlights` | Get highlights   |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│   Express   │────▶│   SQLite    │
│   Frontend  │     │   Backend   │     │   + FTS5    │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Whisper   │   │  Mistral 7B │   │   FAISS     │
│   (Python)  │   │ (llama.cpp) │   │  (Python)   │
└─────────────┘   └─────────────┘   └─────────────┘
```

## License

MIT
