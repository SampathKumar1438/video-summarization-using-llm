import axios from 'axios';
import { extractJSON, formatTime } from '../utils/helpers.js';

// Default to Ollama, but support generic OpenAI-compatible endpoints
const LLM_BASE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:11434/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'llama3.2';

console.log(`LLM Service configured: ${LLM_BASE_URL} with model ${LLM_MODEL}`);

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
    // 1. Prepare Transcript with timestamps
    const transcriptText = segments
        .map(s => `[${Math.floor(s.start_time)}s] ${s.text}`)
        .join('\n')
        .substring(0, 15000); // Token limit safety

    // 2. Construct Enhanced Master Prompt
    const systemPrompt = `You are an expert video analyst specializing in content curation and highlight detection.
Your task is to analyze the provided transcript and generate a structured JSON report.
You must return VALID JSON only. Do not use Markdown. Do not add explanations.

Required Schema:
{
  "summary": {
    "full": "2-3 paragraph detailed summary covering main topics, key points, and conclusions",
    "brief": "One engaging sentence that captures the essence of the video"
  },
  "chapters": [
    {
      "title": "Descriptive Chapter Title",
      "summary": "Brief description of what happens in this chapter",
      "start_time": 0,
      "end_time": 120
    }
  ],
  "highlights": [
    {
      "start_time": 10,
      "end_time": 40,
      "category": "insight|emotional|action|quotable|turning_point",
      "reason": "Specific explanation of why this moment is highlight-worthy",
      "transcript_excerpt": "The exact words spoken during this highlight"
    }
  ],
  "search_index": [
    "keyword1", "keyword2", "concept phrase"
  ]
}`;

    const userPrompt = `Analyze this video transcript (Total Duration: ${Math.floor(duration)} seconds).

## CHAPTER REQUIREMENTS:
- Generate 4-8 logical chapters that cover the ENTIRE video from start to end
- Each chapter should represent a distinct topic or segment
- Use numeric timestamps (in seconds) that match the transcript
- Chapters must be sequential with no gaps: first chapter starts at 0, last ends at ${Math.floor(duration)}

## HIGHLIGHT REQUIREMENTS (VERY IMPORTANT):
Identify the TOP 3 most compelling moments based on these criteria:

1. **EMOTIONAL PEAKS**: Moments of excitement, surprise, laughter, tension, or strong reactions
2. **KEY INSIGHTS**: Important revelations, conclusions, "aha" moments, expert opinions
3. **ACTION/VISUAL INTEREST**: Demonstrations, reveals, transformations, before/after moments
4. **QUOTABLE MOMENTS**: Memorable statements, jokes, catchphrases, powerful quotes
5. **NARRATIVE TURNING POINTS**: Plot twists, topic transitions, climaxes, unexpected changes

For each highlight:
- start_time: The EXACT second from the transcript where the moment begins
- end_time: Include 2-3 seconds AFTER the moment ends for context (duration: 15-60 seconds)
- category: Choose from [insight, emotional, action, quotable, turning_point]
- reason: Explain WHY this specific moment deserves to be highlighted
- transcript_excerpt: Copy the ACTUAL WORDS spoken during this highlight from the transcript

## SEARCH INDEX:
- 10-15 keywords/concepts that would help someone find this video
- Include proper nouns, technical terms, and topic keywords

## TRANSCRIPT:
${transcriptText}

Remember: Return ONLY valid JSON, no markdown formatting.`;

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

    // Fix Highlights with enhanced validation
    result.highlights = result.highlights
        .map(h => {
            // Ensure numeric
            h.start_time = parseFloat(h.start_time) || 0;
            h.end_time = parseFloat(h.end_time) || 0;

            // Clamp to video duration
            h.start_time = Math.max(0, Math.min(h.start_time, duration - 15));
            h.end_time = Math.min(h.end_time, duration);

            // Logic checks
            if (h.end_time <= h.start_time) h.end_time = h.start_time + 30; // Force 30s

            let dur = h.end_time - h.start_time;

            // Clamp duration constraints (15s - 60s)
            if (dur < 15) { h.end_time = Math.min(h.start_time + 15, duration); }
            if (dur > 60) { h.end_time = h.start_time + 60; }

            h.duration = h.end_time - h.start_time;

            // Validate category
            const validCategories = ['insight', 'emotional', 'action', 'quotable', 'turning_point', 'general'];
            if (!validCategories.includes(h.category)) {
                h.category = 'general';
            }

            // Find transcript excerpt if not provided
            if (!h.transcript_excerpt) {
                const relevantSegments = segments.filter(
                    s => s.start_time >= h.start_time && s.end_time <= h.end_time
                );
                h.transcript_excerpt = relevantSegments.map(s => s.text).join(' ').substring(0, 200);
            }

            return h;
        })
        .filter(h => h.duration >= 10) // Remove clips shorter than 10s
        .slice(0, 3); // Enforce limit

    // Ensure at least one highlight if segments exist
    if (result.highlights.length === 0 && segments.length > 0) {
        // Find the segment with the most text (likely most content-rich)
        const richestSegment = segments.reduce((best, seg) =>
            seg.text.length > best.text.length ? seg : best
            , segments[0]);

        result.highlights.push({
            start_time: Math.max(0, richestSegment.start_time - 2),
            end_time: Math.min(richestSegment.end_time + 28, duration),
            category: 'general',
            reason: "Auto-selected content-rich segment",
            transcript_excerpt: richestSegment.text.substring(0, 200),
            duration: 30
        });
    }

    // Fix Chapters (ensure coverage)
    if (result.chapters.length === 0) {
        result.chapters = generateHeuristicChapters(segments, duration);
    } else {
        // Ensure chapters cover the full duration
        result.chapters.sort((a, b) => a.start_time - b.start_time);
        result.chapters[0].start_time = 0;
        result.chapters[result.chapters.length - 1].end_time = duration;
    }

    return result;
}

/**
 * Fallback when LLM fails effectively
 */
function generateFallbackAnalysis(segments, duration) {
    const fullText = segments.map(s => s.text).join(' ');

    // Find interesting segments based on text length and position
    const highlightCandidates = segments
        .map((s, idx) => ({ ...s, score: s.text.length + (idx < 3 ? 50 : 0) + (idx > segments.length - 3 ? 30 : 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    return {
        summary: {
            full: fullText.substring(0, 500) + "...",
            brief: "Automated transcript processing."
        },
        chapters: generateHeuristicChapters(segments, duration),
        highlights: highlightCandidates.map((seg, idx) => ({
            start_time: Math.max(0, seg.start_time - 2),
            end_time: Math.min(seg.end_time + 28, duration),
            category: idx === 0 ? 'insight' : 'general',
            reason: idx === 0 ? "Opening segment" : "Content-rich segment",
            transcript_excerpt: seg.text.substring(0, 200),
            duration: Math.min(30, seg.end_time - seg.start_time + 30)
        })),
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
