import axios from 'axios';

const WHISPER_SERVICE_URL = process.env.WHISPER_SERVICE_URL || 'http://localhost:5000';

/**
 * Transcribe audio file using Whisper service
 * @param {string} audioPath - Path to the audio file
 * @returns {Promise<Array<{start: number, end: number, text: string, confidence: number}>>}
 */
export async function transcribeAudio(audioPath) {
    try {
        console.log(`Sending audio for transcription: ${audioPath}`);

        const response = await axios.post(
            `${WHISPER_SERVICE_URL}/transcribe`,
            { audio_path: audioPath },
            {
                timeout: 3600000, // 1 hour timeout for long videos
                headers: { 'Content-Type': 'application/json' }
            }
        );

        if (response.data.error) {
            throw new Error(response.data.error);
        }

        // Transform response to our format
        const segments = response.data.segments.map((seg, index) => ({
            segment_index: index,
            start_time: seg.start,
            end_time: seg.end,
            text: seg.text.trim(),
            confidence: seg.confidence || null
        }));

        console.log(`Transcription complete: ${segments.length} segments`);
        return segments;
    } catch (error) {
        console.error('Whisper service error:', error.message);
        throw error;
    }
}

/**
 * Check if Whisper service is available
 */
export async function checkWhisperHealth() {
    try {
        const response = await axios.get(`${WHISPER_SERVICE_URL}/health`, { timeout: 5000 });
        return response.data.status === 'ok';
    } catch {
        return false;
    }
}

export default { transcribeAudio, checkWhisperHealth };
