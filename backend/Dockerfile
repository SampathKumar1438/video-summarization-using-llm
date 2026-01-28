FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create storage directories
RUN mkdir -p storage/videos storage/audio storage/highlights

# Expose port
EXPOSE 4000

# Start the application
CMD ["npm", "start"]
