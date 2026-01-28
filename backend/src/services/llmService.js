import axios from 'axios';
import { extractJSON, formatTime } from '../utils/helpers.js';

// Default to Ollama, but support generic OpenAI-compatible endpoints
const LLM_BASE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:11434/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'tinyllama';

/**
 * Generate completion from LLM using Chat API
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} maxTokens
 */
async function generateCompletion(messages, maxTokens = 4096) {
    try {
        const response = await axios.post(
            `${LLM_BASE_URL}/chat/completions`,
            {
                model: LLM_MODEL,
                messages,
                max_tokens: maxTokens,
                temperature: 0.2, // Lower temperature for more deterministic JSON
                stream: false
            },
            {
                timeout: 600000, // 10 minute timeout
                headers: { 'Content-Type': 'application/json' }
            }
        );

        return response.data.choices[0].message.content || '';
    } catch (error) {
        console.error('LLM service error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        throw error;
    }
}

/**
 * Main consolidated analysis pipeline
 * @param {Array<{start_time: number, end_time: number, text: string}>} segments
 * @param {number} duration
 */
export async function analyzeVideo(segments, duration) {
    // 1. Prepare Transcript
    const transcriptText = segments
        .map(s => `[${Math.floor(s.start_time)}] ${s.text}`)
        .join('\n')
        .substring(0, 15000); // Token limit safety

    // 2. Construct Master Prompt
    const systemPrompt = `You are an expert video analyst.
Your task is to analyze the provided transcript and generate a structured JSON report.
You must return VALID JSON only. Do not use Markdown. Do not add explanations.

Required Schema:
{
  "summary": {
    "full": "2-3 paragraph detailed summary",
    "brief": "One sentence hook"
  },
  "chapters": [
    {
      "title": "Chapter Title",
      "summary": "Brief description",
      "start_time": 0,
      "end_time": 120
    }
  ],
  "highlights": [
    {
      "start_time": 10,
      "end_time": 40,
      "reason": "Why this is interesting",
      "duration": 30
    }
  ],
  "search_index": [
    "keyword1", "keyword2", "concept phrase"
  ]
}`;

    const userPrompt = `Analyze this video transcript (Duration: ${duration}s).

Constraints:
1. **Chapters**: Generate 4-8 logical chapters covering the whole video. Use numeric timestamps (seconds).
2. **Highlights**: specific funny/interesting/important moments.
   - EXACTLY 3 clips.
   - Each clip MUST be 15-60 seconds long.
   - start_time MUST be < end_time.
3. **Search Index**: 10-15 keywords/concepts for finding this video.

Transcript:
${transcriptText}`;

    // 3. Call LLM
    try {
        console.log('Sending unified analysis request to LLM...');
        const rawResponse = await generateCompletion([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ]);

        console.log('LLM Raw Response received. Length:', rawResponse.length);

        // 4. Safe Parse & Validation
        const data = extractJSON(rawResponse);

        if (!data) {
            console.error('Failed to parse LLM JSON. Raw:', rawResponse.substring(0, 200));
            throw new Error('Invalid JSON from LLM');
        }

        // 5. Post-Processing & Normalization
        return normalizeAnalysis(data, duration, segments);

    } catch (error) {
        console.error('LLM Analysis failed. Falling back to heuristic generation.', error);
        return generateFallbackAnalysis(segments, duration);
    }
}

/**
 * Validate and fix LLM output
 */
function normalizeAnalysis(data, duration, segments) {
    // Ensure structure
    const result = {
        summary: {
            full: data.summary?.full || "Analysis available but summary generation failed.",
            brief: data.summary?.brief || "Video processed."
        },
        chapters: Array.isArray(data.chapters) ? data.chapters : [],
        highlights: Array.isArray(data.highlights) ? data.highlights : [],
        search_index: Array.isArray(data.search_index) ? data.search_index : []
    };

    // Fix Highlights
    result.highlights = result.highlights
        .map(h => {
            // Ensure numeric
            h.start_time = parseFloat(h.start_time) || 0;
            h.end_time = parseFloat(h.end_time) || 0;

            // Logic checks
            if (h.end_time <= h.start_time) h.end_time = h.start_time + 30; // Force 30s
            let dur = h.end_time - h.start_time;

            // Clamp constraints (15s - 60s)
            if (dur < 15) { h.end_time = h.start_time + 15; }
            if (dur > 60) { h.end_time = h.start_time + 60; }

            h.duration = h.end_time - h.start_time;
            return h;
        })
        .slice(0, 3); // Enforce limit

    // Ensure at least one highlight if segments exist
    if (result.highlights.length === 0 && segments.length > 0) {
        const firstSeg = segments[0];
        result.highlights.push({
            start_time: firstSeg.start_time,
            end_time: Math.min(firstSeg.start_time + 30, duration),
            reason: "Auto-generated intro highlight",
            duration: 30
        });
    }

    // Fix Chapters (ensure coverage)
    if (result.chapters.length === 0) {
        result.chapters.push({
            title: "Full Video",
            summary: "Complete recording",
            start_time: 0,
            end_time: duration
        });
    }

    return result;
}

/**
 * Fallback when LLM fails effectively
 */
function generateFallbackAnalysis(segments, duration) {
    const fullText = segments.map(s => s.text).join(' ');

    return {
        summary: {
            full: fullText.substring(0, 500) + "...",
            brief: "Automated transcript processing."
        },
        chapters: generateHeuristicChapters(segments, duration),
        highlights: [{
            start_time: 0,
            end_time: Math.min(30, duration),
            reason: "Preview Clip",
            duration: Math.min(30, duration)
        }],
        search_index: ["video", "auto-generated"]
    };
}

/**
 * Simple even-split chapters for fallback
 */
function generateHeuristicChapters(segments, duration) {
    if (duration < 60) return [{ title: "Full Video", summary: "Content", start_time: 0, end_time: duration }];

    // Split into 4 parts
    const part = duration / 4;
    return [0, 1, 2, 3].map(i => ({
        title: `Part ${i + 1}`,
        summary: `Segment ${i + 1}`,
        start_time: Math.floor(i * part),
        end_time: Math.floor(Math.min((i + 1) * part, duration))
    }));
}

/**
 * Check if LLM service is available
 */
export async function checkLLMHealth() {
    try {
        const response = await axios.get(`${LLM_BASE_URL}/models`, { timeout: 2000 });
        return response.status === 200;
    } catch {
        return false;
    }
}

export default { analyzeVideo, checkLLMHealth };
