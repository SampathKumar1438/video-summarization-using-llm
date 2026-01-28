FROM ubuntu:22.04

# Install build dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    cmake \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone and build llama.cpp using CMake
RUN git clone https://github.com/ggerganov/llama.cpp.git && \
    cd llama.cpp && \
    cmake -B build && \
    cmake --build build --config Release -j$(nproc)

# Create models directory
RUN mkdir -p /app/models

# Copy startup script
COPY start_server.sh /app/start_server.sh
RUN chmod +x /app/start_server.sh

# Expose port
EXPOSE 8080

# Start the server
CMD ["/app/start_server.sh"]
