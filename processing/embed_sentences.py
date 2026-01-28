"""
Embedding and Semantic Search Service
Flask API for generating embeddings and FAISS-based semantic search
"""

import os
import json
import numpy as np
import faiss
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import traceback

app = Flask(__name__)

# Configuration
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
FAISS_INDEX_PATH = os.environ.get("FAISS_INDEX_PATH", "/app/storage/faiss_index")
METADATA_PATH = os.environ.get("METADATA_PATH", "/app/storage/faiss_metadata.json")

# Global variables
model = None
faiss_index = None
metadata = {}  # Maps FAISS index position to transcript_id


def get_model():
    """Load the sentence transformer model"""
    global model
    if model is None:
        print(f"Loading embedding model: {EMBEDDING_MODEL}")
        model = SentenceTransformer(EMBEDDING_MODEL)
        print("Embedding model loaded successfully")
    return model


def get_faiss_index():
    """Get or create FAISS index"""
    global faiss_index, metadata

    if faiss_index is None:
        embedding_dim = 384  # MiniLM dimension

        # Try to load existing index
        if os.path.exists(FAISS_INDEX_PATH):
            print(f"Loading existing FAISS index from {FAISS_INDEX_PATH}")
            faiss_index = faiss.read_index(FAISS_INDEX_PATH)

            # Load metadata
            if os.path.exists(METADATA_PATH):
                with open(METADATA_PATH, "r") as f:
                    metadata = json.load(f)
        else:
            print("Creating new FAISS index")
            # Use L2 distance (Euclidean) - can also use IndexFlatIP for cosine similarity
            faiss_index = faiss.IndexFlatL2(embedding_dim)

    return faiss_index


def save_faiss_index():
    """Save FAISS index and metadata to disk"""
    global faiss_index, metadata

    if faiss_index is not None:
        # Ensure directory exists
        os.makedirs(os.path.dirname(FAISS_INDEX_PATH), exist_ok=True)

        # Save index
        faiss.write_index(faiss_index, FAISS_INDEX_PATH)

        # Save metadata
        with open(METADATA_PATH, "w") as f:
            json.dump(metadata, f)

        print(f"FAISS index saved with {faiss_index.ntotal} vectors")


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    index = get_faiss_index()
    return jsonify(
        {
            "status": "ok",
            "model": EMBEDDING_MODEL,
            "index_size": index.ntotal if index else 0,
        }
    )


@app.route("/embed", methods=["POST"])
def embed():
    """
    Generate embeddings for text segments

    Request JSON:
    {
        "segments": [
            {"id": 1, "text": "Hello world"},
            {"id": 2, "text": "Another segment"}
        ]
    }

    Response JSON:
    {
        "embeddings": [
            {"id": 1, "embedding": [0.1, 0.2, ...]},
            {"id": 2, "embedding": [0.3, 0.4, ...]}
        ]
    }
    """
    try:
        data = request.get_json()

        if not data or "segments" not in data:
            return jsonify({"error": "segments is required"}), 400

        segments = data["segments"]

        if not segments:
            return jsonify({"embeddings": []})

        # Get model
        embedding_model = get_model()

        # Extract texts
        texts = [seg["text"] for seg in segments]
        ids = [seg["id"] for seg in segments]

        print(f"Generating embeddings for {len(texts)} segments")

        # Generate embeddings
        embeddings = embedding_model.encode(texts, show_progress_bar=False)

        # Format response
        result = []
        for i, (seg_id, embedding) in enumerate(zip(ids, embeddings)):
            result.append({"id": seg_id, "embedding": embedding.tolist()})

        print(f"Generated {len(result)} embeddings")

        return jsonify({"embeddings": result})

    except Exception as e:
        print(f"Embedding error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/index", methods=["POST"])
def index_embeddings():
    """
    Add embeddings to FAISS index

    Request JSON:
    {
        "video_id": 1,
        "embeddings": [
            {"id": 1, "embedding": [0.1, 0.2, ...]},
            {"id": 2, "embedding": [0.3, 0.4, ...]}
        ]
    }
    """
    try:
        global metadata

        data = request.get_json()

        if not data or "embeddings" not in data:
            return jsonify({"error": "embeddings is required"}), 400

        video_id = data.get("video_id")
        embeddings_data = data["embeddings"]

        if not embeddings_data:
            return jsonify({"message": "No embeddings to index"})

        # Get FAISS index
        index = get_faiss_index()

        # Prepare vectors
        vectors = np.array([e["embedding"] for e in embeddings_data], dtype=np.float32)

        # Get starting index
        start_idx = index.ntotal

        # Add to index
        index.add(vectors)

        # Update metadata
        for i, emb in enumerate(embeddings_data):
            faiss_idx = start_idx + i
            metadata[str(faiss_idx)] = {
                "transcript_id": emb["id"],
                "video_id": video_id,
            }

        # Save index
        save_faiss_index()

        print(f"Indexed {len(embeddings_data)} vectors. Total: {index.ntotal}")

        return jsonify(
            {
                "message": f"Indexed {len(embeddings_data)} vectors",
                "total_vectors": index.ntotal,
            }
        )

    except Exception as e:
        print(f"Indexing error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/search", methods=["POST"])
def search():
    """
    Semantic search using FAISS

    Request JSON:
    {
        "query": "search query text",
        "video_id": 1,  // optional, filter by video
        "top_k": 10
    }

    Response JSON:
    {
        "results": [
            {"transcript_id": 1, "similarity": 0.95},
            {"transcript_id": 2, "similarity": 0.87}
        ]
    }
    """
    try:
        data = request.get_json()

        if not data or "query" not in data:
            return jsonify({"error": "query is required"}), 400

        query = data["query"]
        video_id = data.get("video_id")
        top_k = data.get("top_k", 10)

        # Get model and index
        embedding_model = get_model()
        index = get_faiss_index()

        if index.ntotal == 0:
            return jsonify({"results": []})

        # Generate query embedding
        query_embedding = embedding_model.encode([query], show_progress_bar=False)
        query_vector = np.array(query_embedding, dtype=np.float32)

        # Search - get more results if filtering by video
        search_k = (
            min(top_k * 10, index.ntotal) if video_id else min(top_k, index.ntotal)
        )

        distances, indices = index.search(query_vector, search_k)

        # Process results
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1:
                continue

            meta = metadata.get(str(idx))
            if not meta:
                continue

            # Filter by video if specified
            if video_id and meta.get("video_id") != video_id:
                continue

            # Convert L2 distance to similarity score (0-1 range)
            # Lower distance = higher similarity
            similarity = 1 / (1 + dist)

            results.append(
                {
                    "transcript_id": meta["transcript_id"],
                    "video_id": meta.get("video_id"),
                    "similarity": round(float(similarity), 4),
                }
            )

            if len(results) >= top_k:
                break

        return jsonify({"results": results})

    except Exception as e:
        print(f"Search error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/clear", methods=["POST"])
def clear_index():
    """Clear the FAISS index (for development/testing)"""
    global faiss_index, metadata

    try:
        embedding_dim = 384
        faiss_index = faiss.IndexFlatL2(embedding_dim)
        metadata = {}
        save_faiss_index()

        return jsonify({"message": "Index cleared"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Pre-load model
    print("Pre-loading embedding model...")
    get_model()

    # Initialize FAISS index
    print("Initializing FAISS index...")
    get_faiss_index()

    # Start Flask server
    port = int(os.environ.get("EMBEDDING_PORT", 5001))
    print(f"Starting Embedding service on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
