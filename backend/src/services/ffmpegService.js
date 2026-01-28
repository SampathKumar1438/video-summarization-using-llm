import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';
import fs from 'fs';

// Set paths for ffmpeg and ffprobe
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const AUDIO_STORAGE_PATH = process.env.AUDIO_STORAGE_PATH || './storage/audio';
const HIGHLIGHTS_STORAGE_PATH = process.env.HIGHLIGHTS_STORAGE_PATH || './storage/highlights';

/**
 * Extract audio from video file
 * @param {string} videoPath - Path to the video file
 * @param {string} videoId - Video ID for naming the output
 * @returns {Promise<{audioPath: string, duration: number}>}
 */
export function extractAudio(videoPath, videoId) {
    return new Promise((resolve, reject) => {
        const audioPath = path.resolve(AUDIO_STORAGE_PATH, `${videoId}.wav`);

        // Ensure directory exists
        if (!fs.existsSync(AUDIO_STORAGE_PATH)) {
            fs.mkdirSync(AUDIO_STORAGE_PATH, { recursive: true });
        }

        let duration = 0;

        ffmpeg(videoPath)
            .outputOptions([
                '-vn',           // No video
                '-acodec', 'pcm_s16le',  // PCM format for Whisper
                '-ar', '16000',  // 16kHz sample rate
                '-ac', '1'       // Mono
            ])
            .on('codecData', (data) => {
                // Parse duration from format like "00:30:00.00"
                const timeParts = data.duration.split(':');
                if (timeParts.length === 3) {
                    duration = parseFloat(timeParts[0]) * 3600 +
                        parseFloat(timeParts[1]) * 60 +
                        parseFloat(timeParts[2]);
                }
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err.message);
                reject(err);
            })
            .on('end', () => {
                console.log(`Audio extracted: ${audioPath}`);
                resolve({ audioPath, duration });
            })
            .save(audioPath);
    });
}

/**
 * Get video duration
 * @param {string} videoPath - Path to the video file
 * @returns {Promise<number>} Duration in seconds
 */
export function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(metadata.format.duration || 0);
        });
    });
}

/**
 * Create highlight video by cutting and merging clips
 * @param {string} videoPath - Path to source video
 * @param {Array<{start_time: number, end_time: number}>} clips - Array of clip timestamps
 * @param {string} outputId - Output file identifier
 * @returns {Promise<string>} Path to the highlight video
 */
export function createHighlightVideo(videoPath, clips, outputId) {
    return new Promise(async (resolve, reject) => {
        if (!clips || clips.length === 0) {
            reject(new Error('No clips provided'));
            return;
        }

        // Ensure directory exists
        if (!fs.existsSync(HIGHLIGHTS_STORAGE_PATH)) {
            fs.mkdirSync(HIGHLIGHTS_STORAGE_PATH, { recursive: true });
        }

        const outputPath = path.join(HIGHLIGHTS_STORAGE_PATH, `${outputId}_highlight.mp4`);
        const tempDir = path.join(HIGHLIGHTS_STORAGE_PATH, `temp_${outputId}`);

        // Create temp directory for clips
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        try {
            // Extract each clip
            const clipPaths = [];
            for (let i = 0; i < clips.length; i++) {
                const clip = clips[i];
                const clipPath = path.join(tempDir, `clip_${i}.mp4`);
                clipPaths.push(clipPath);

                await extractClip(videoPath, clip.start_time, clip.end_time, clipPath);
            }

            // Create concat file
            const concatFilePath = path.join(tempDir, 'concat.txt');
            const concatContent = clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
            fs.writeFileSync(concatFilePath, concatContent);

            // Merge clips
            await mergeClips(concatFilePath, outputPath);

            // Cleanup temp files
            for (const clipPath of clipPaths) {
                if (fs.existsSync(clipPath)) fs.unlinkSync(clipPath);
            }
            if (fs.existsSync(concatFilePath)) fs.unlinkSync(concatFilePath);
            if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);

            resolve(outputPath);
        } catch (error) {
            // Cleanup on error
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            reject(error);
        }
    });
}

/**
 * Extract a single clip from video
 */
function extractClip(videoPath, startTime, endTime, outputPath) {
    return new Promise((resolve, reject) => {
        const duration = endTime - startTime;

        ffmpeg(videoPath)
            .setStartTime(startTime)
            .setDuration(duration)
            .outputOptions([
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-avoid_negative_ts', 'make_zero'
            ])
            .on('error', reject)
            .on('end', resolve)
            .save(outputPath);
    });
}

/**
 * Merge clips using concat demuxer
 */
function mergeClips(concatFilePath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(concatFilePath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions(['-c', 'copy'])
            .on('error', reject)
            .on('end', resolve)
            .save(outputPath);
    });
}

export default { extractAudio, getVideoDuration, createHighlightVideo };
