import { useEffect, useRef } from "react";
import { formatTime } from "../utils/formatTime";

export default function TranscriptView({ segments, currentTime, onSeek }) {
  const containerRef = useRef(null);
  const activeRef = useRef(null);

  // Find the active segment
  const activeIndex = segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime,
  );

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const active = activeRef.current;

      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();

      // Only scroll if active item is out of view
      if (
        activeRect.top < containerRect.top ||
        activeRect.bottom > containerRect.bottom
      ) {
        active.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeIndex]);

  return (
    <div>
      <h3 className="card-title mb-4">Transcript</h3>
      <div
        ref={containerRef}
        style={{
          maxHeight: "500px",
          overflowY: "auto",
          paddingRight: "8px",
        }}
      >
        {segments.length === 0 ? (
          <p className="text-muted">No transcript available</p>
        ) : (
          <div className="flex flex-col gap-2">
            {segments.map((segment, i) => (
              <div
                key={segment.id}
                ref={i === activeIndex ? activeRef : null}
                onClick={() => onSeek(segment.startTime)}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "12px",
                  borderRadius: "var(--border-radius-sm)",
                  cursor: "pointer",
                  background:
                    i === activeIndex
                      ? "rgba(124, 58, 237, 0.15)"
                      : "transparent",
                  borderLeft:
                    i === activeIndex
                      ? "3px solid var(--accent-primary)"
                      : "3px solid transparent",
                  transition: "all var(--transition-fast)",
                }}
                onMouseEnter={(e) => {
                  if (i !== activeIndex) {
                    e.currentTarget.style.background = "var(--bg-tertiary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (i !== activeIndex) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: "0.8rem",
                    color:
                      i === activeIndex
                        ? "var(--accent-secondary)"
                        : "var(--text-muted)",
                    fontFamily: "monospace",
                    width: "50px",
                  }}
                >
                  {formatTime(segment.startTime)}
                </span>
                <p
                  style={{
                    fontSize: "0.95rem",
                    lineHeight: 1.6,
                    color:
                      i === activeIndex
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                  }}
                >
                  {segment.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
