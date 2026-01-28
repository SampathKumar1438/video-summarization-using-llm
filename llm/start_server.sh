#!/bin/bash

# LLM Server Startup Script
# Runs llama.cpp server with Mistral 7B model

MODEL_PATH="${MODEL_PATH:-/app/models/mistral-7b-instruct-v0.2.Q4_K_M.gguf}"
CONTEXT_SIZE="${CONTEXT_SIZE:-4096}"
THREADS="${THREADS:-4}"
PORT="${PORT:-8080}"

echo "=========================================="
echo "  AI Video Intelligence - LLM Service"
echo "=========================================="
echo "Model: $MODEL_PATH"
echo "Context Size: $CONTEXT_SIZE"
echo "Threads: $THREADS"
echo "Port: $PORT"
echo "=========================================="

# Check if model exists
if [ ! -f "$MODEL_PATH" ]; then
    echo "ERROR: Model file not found at $MODEL_PATH"
    echo ""
    echo "Please download the Mistral 7B model:"
    echo "  wget https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf"
    echo ""
    echo "And place it in the models directory."
    echo ""
    echo "Waiting for model file..."
    
    # Wait loop for model file
    while [ ! -f "$MODEL_PATH" ]; do
        sleep 10
    done
    
    echo "Model file detected! Starting server..."
fi

# Start llama.cpp server (new CMake build location)
cd /app/llama.cpp

# The server binary is now in build/bin/
./build/bin/llama-server \
    --model "$MODEL_PATH" \
    --ctx-size "$CONTEXT_SIZE" \
    --threads "$THREADS" \
    --host 0.0.0.0 \
    --port "$PORT" \
    --parallel 1
