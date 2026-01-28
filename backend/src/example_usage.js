import { analyzeVideo } from './services/llmService.js';

// Mock Data
const duration = 125; // 2 minutes 5 seconds
const segments = [
    { start_time: 0, end_time: 15, text: "Welcome to this video tutorial on Node.js streams." },
    { start_time: 15, end_time: 45, text: "Streams are collections of data causing problems when they are too large for memory. That's why we use streams to process data piece by piece." },
    { start_time: 45, end_time: 80, text: "There are four types of streams: Readable, Writable, Duplex, and Transform. Let's look at each one carefully." },
    { start_time: 80, end_time: 100, text: "In this example, we will pipe a readable stream into a writable stream efficiently." },
    { start_time: 100, end_time: 125, text: "Thank you for watching. Don't forget to like and subscribe for more backend content." }
];

async function runDemo() {
    console.log("--- Starting Video Analysis Demo ---");
    console.log(`Video Duration: ${duration}s`);
    console.log(`Segments: ${segments.length}`);

    try {
        console.log("\nCalling analyzeVideo()...");
        const result = await analyzeVideo(segments, duration);

        console.log("\n--- Analysis Result ---");
        console.log("Summary Full:", result.summary.full);
        console.log("Summary Brief:", result.summary.brief);

        console.log("\nChapters:");
        result.chapters.forEach(c => {
            console.log(`- [${c.start_time}-${c.end_time}s] ${c.title}: ${c.summary}`);
        });

        console.log("\nHighlights:");
        result.highlights.forEach(h => {
            console.log(`- [${h.start_time}-${h.end_time}s] (${h.duration}s) ${h.reason}`);
        });

        console.log("\nSearch Index Keywords:");
        console.log(result.search_index.join(", "));

    } catch (error) {
        console.error("Demo failed:", error);
    }
}

runDemo();
