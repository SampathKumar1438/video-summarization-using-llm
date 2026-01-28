/**
 * Format seconds to HH:MM:SS format
 */
export function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generate a unique filename
 */
export function generateFilename(originalName) {
    const ext = originalName.split('.').pop();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${random}.${ext}`;
}

/**
 * Parse JSON safely with repair attempts
 */
export function parseJSON(str) {
    if (typeof str !== 'string') return null;
    try {
        return JSON.parse(str);
    } catch (e) {
        try {
            // Simple repair for common trailing comma issues
            const fixed = str.replace(/,\s*([\]}])/g, '$1');
            return JSON.parse(fixed);
        } catch {
            return null;
        }
    }
}

/**
 * Extract JSON from LLM response (handles markdown, loose text, multiple blocks)
 */
export function extractJSON(text) {
    if (!text) return null;

    // 1. Try finding markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        const parsed = parseJSON(codeBlockMatch[1].trim());
        if (parsed) return parsed;
    }

    // 2. Try finding the first outer-most object or array
    // This regex looks for { ... } or [ ... ] across multiple lines
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
        const parsed = parseJSON(jsonMatch[1]);
        if (parsed) return parsed;
    }

    // 3. Last ditch: try to just parse the whole text (maybe it's just raw JSON)
    return parseJSON(text);
}

/**
 * Delay for specified milliseconds
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default { formatTime, generateFilename, parseJSON, extractJSON, delay };
