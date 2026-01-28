import { Play, Clock } from "lucide-react";
import { formatTime } from "../utils/formatTime";

export default function ChapterList({ chapters, currentTime, onSeek }) {
  // Find active chapter
  const activeIndex = chapters.findIndex(
    (c) => currentTime >= c.startTime && currentTime < c.endTime,
  );

  if (chapters.length === 0) {
    return (
      <div className="card">
        <h3 className="card-title mb-4">Chapters</h3>
        <p className="text-muted">No chapters available</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ position: "sticky", top: "100px" }}>
      <h3 className="card-title mb-4">Chapters</h3>
      <div className="flex flex-col gap-2">
        {chapters.map((chapter, i) => (
          <div
            key={chapter.id}
            onClick={() => onSeek(chapter.startTime)}
            style={{
              padding: "14px",
              borderRadius: "var(--border-radius-sm)",
              cursor: "pointer",
              background:
                i === activeIndex
                  ? "rgba(124, 58, 237, 0.15)"
                  : "var(--bg-tertiary)",
              border:
                i === activeIndex
                  ? "1px solid var(--accent-primary)"
                  : "1px solid transparent",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              if (i !== activeIndex) {
                e.currentTarget.style.background = "var(--bg-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (i !== activeIndex) {
                e.currentTarget.style.background = "var(--bg-tertiary)";
              }
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  background:
                    i === activeIndex
                      ? "var(--accent-primary)"
                      : "var(--bg-secondary)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {i === activeIndex ? (
                  <Play size={12} color="white" fill="white" />
                ) : (
                  <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontWeight: 500,
                  color:
                    i === activeIndex
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  fontSize: "0.95rem",
                }}
              >
                {chapter.title}
              </span>
            </div>

            {chapter.summary && (
              <p
                className="text-sm text-muted"
                style={{
                  marginLeft: "40px",
                  marginBottom: "8px",
                  lineHeight: 1.5,
                }}
              >
                {chapter.summary}
              </p>
            )}

            <div
              className="flex items-center gap-2 text-sm text-muted"
              style={{ marginLeft: "40px" }}
            >
              <Clock size={12} />
              <span>
                {formatTime(chapter.startTime)} - {formatTime(chapter.endTime)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
