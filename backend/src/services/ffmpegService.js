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
                console.error('FFmpeg audio extraction error:', err.message);
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
 * Create highlight video by cutting and merging clips with proper audio/video sync
 * @param {string} videoPath - Path to source video
 * @param {Array<{start_time: number, end_time: number, category?: string, reason?: string}>} clips - Array of clip timestamps
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
            console.log(`Creating highlight video with ${clips.length} clips...`);

            // Sort clips by start time
            const sortedClips = [...clips].sort((a, b) => a.start_time - b.start_time);

            // Extract each clip with improved settings
            const clipPaths = [];
            for (let i = 0; i < sortedClips.length; i++) {
                const clip = sortedClips[i];
                const clipPath = path.join(tempDir, `clip_${i}.mp4`);
                clipPaths.push(clipPath);

                console.log(`Extracting clip ${i + 1}/${sortedClips.length}: ${clip.start_time}s - ${clip.end_time}s (${clip.category || 'general'})`);
                await extractClipEnhanced(videoPath, clip.start_time, clip.end_time, clipPath, i === 0, i === sortedClips.length - 1);
            }

            // Create concat file
            const concatFilePath = path.join(tempDir, 'concat.txt');
            const concatContent = clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
            fs.writeFileSync(concatFilePath, concatContent);

            // Merge clips with re-encoding for smooth transitions
            await mergeClipsWithTransitions(concatFilePath, outputPath);

            // Cleanup temp files
            for (const clipPath of clipPaths) {
                if (fs.existsSync(clipPath)) fs.unlinkSync(clipPath);
            }
            if (fs.existsSync(concatFilePath)) fs.unlinkSync(concatFilePath);
            if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);

            console.log(`Highlight video created: ${outputPath}`);
            resolve(outputPath);
        } catch (error) {
            console.error('Highlight video creation error:', error);
            // Cleanup on error
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            reject(error);
        }
    });
}

/**
 * Extract a single clip with enhanced quality and fade effects
 * @param {string} videoPath - Source video path
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 * @param {string} outputPath - Output clip path
 * @param {boolean} isFirst - Is this the first clip
 * @param {boolean} isLast - Is this the last clip
 */
function extractClipEnhanced(videoPath, startTime, endTime, outputPath, isFirst, isLast) {
    return new Promise((resolve, reject) => {
        const duration = endTime - startTime;
        const fadeDuration = 0.3; // 300ms fade

        // Build filter complex for fades
        let videoFilters = [];
        let audioFilters = [];

        // Add fade in at the beginning of each clip
        videoFilters.push(`fade=t=in:st=0:d=${fadeDuration}`);
        audioFilters.push(`afade=t=in:st=0:d=${fadeDuration}`);

        // Add fade out at the end of each clip
        const fadeOutStart = Math.max(0, duration - fadeDuration);
        videoFilters.push(`fade=t=out:st=${fadeOutStart}:d=${fadeDuration}`);
        audioFilters.push(`afade=t=out:st=${fadeOutStart}:d=${fadeDuration}`);

        // Use -ss before -i for accurate seeking (fast seek to keyframe, then precise seek)
        ffmpeg()
            .input(videoPath)
            .inputOptions([`-ss ${startTime}`])  // Seek before input for accuracy
            .outputOptions([
                `-t ${duration}`,                // Duration
                '-c:v', 'libx264',              // H.264 video codec
                '-preset', 'fast',              // Encoding speed/quality tradeoff
                '-crf', '23',                   // Constant Rate Factor (18-28, lower = better)
                '-pix_fmt', 'yuv420p',          // Pixel format for compatibility
                '-c:a', 'aac',                  // AAC audio codec
                '-b:a', '128k',                 // Audio bitrate
                '-ar', '44100',                 // Audio sample rate
                '-ac', '2',                     // Stereo audio
                '-vf', videoFilters.join(','),  // Video filters (fades)
                '-af', audioFilters.join(','),  // Audio filters (fades)
                '-movflags', '+faststart',      // Optimize for web playback
                '-avoid_negative_ts', 'make_zero'
            ])
            .on('start', (cmd) => {
                console.log('FFmpeg command:', cmd.substring(0, 200) + '...');
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    process.stdout.write(`\rClip progress: ${progress.percent.toFixed(1)}%`);
                }
            })
            .on('error', (err, stdout, stderr) => {
                console.error('FFmpeg clip extraction error:', err.message);
                console.error('stderr:', stderr);
                reject(err);
            })
            .on('end', () => {
                console.log(''); // New line after progress
                resolve();
            })
            .save(outputPath);
    });
}

/**
 * Merge clips with smooth transitions using concat demuxer
 */
function mergeClipsWithTransitions(concatFilePath, outputPath) {
    return new Promise((resolve, reject) => {
        // Since clips already have fades, we can use copy mode for faster processing
        // But re-encoding ensures consistent format
        ffmpeg()
            .input(concatFilePath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-movflags', '+faststart'
            ])
            .on('progress', (progress) => {
                if (progress.percent) {
                    process.stdout.write(`\rMerge progress: ${progress.percent.toFixed(1)}%`);
                }
            })
            .on('error', (err, stdout, stderr) => {
                console.error('FFmpeg merge error:', err.message);
                reject(err);
            })
            .on('end', () => {
                console.log(''); // New line after progress
                resolve();
            })
            .save(outputPath);
    });
}

export default { extractAudio, getVideoDuration, createHighlightVideo };
