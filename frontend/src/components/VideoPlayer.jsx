import { forwardRef, useEffect, useState } from "react";
import { formatTime } from "../utils/formatTime";

const VideoPlayer = forwardRef(
  ({ src, chapters, onTimeUpdate, onSeek }, ref) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentChapter, setCurrentChapter] = useState(null);

    useEffect(() => {
      const video = ref?.current;
      if (!video) return;

      const handleTimeUpdate = () => {
        const time = video.currentTime;
        onTimeUpdate?.(time);

        // Find current chapter
        if (chapters?.length > 0) {
          const chapter = chapters.find(
            (c) => time >= c.startTime && time < c.endTime,
          );
          if (chapter && chapter.id !== currentChapter?.id) {
            setCurrentChapter(chapter);
          }
        }
      };

      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);

      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);

      return () => {
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
      };
    }, [ref, chapters, onTimeUpdate, currentChapter]);

    return (
      <div style={{ position: "relative" }}>
        <video
          ref={ref}
          controls
          style={{
            width: "100%",
            borderRadius: "var(--border-radius)",
            background: "#000",
          }}
        >
          <source src={src} type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        {currentChapter && (
          <div
            style={{
              position: "absolute",
              bottom: "60px",
              left: "16px",
              background: "rgba(0, 0, 0, 0.8)",
              padding: "8px 16px",
              borderRadius: "var(--border-radius-sm)",
              backdropFilter: "blur(10px)",
              opacity: isPlaying ? 1 : 0,
              transition: "opacity 0.3s ease",
              pointerEvents: "none",
            }}
          >
            <p style={{ fontWeight: 500, fontSize: "0.9rem" }}>
              {currentChapter.title}
            </p>
          </div>
        )}
      </div>
    );
  },
);

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
