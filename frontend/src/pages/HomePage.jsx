import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Upload,
  Video,
  Clock,
  FileVideo,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { getVideos, deleteVideo } from "../hooks/useApi";
import VideoUpload from "../components/VideoUpload";
import {
  formatDuration,
  formatFileSize,
  formatRelativeTime,
} from "../utils/formatTime";

const statusBadge = {
  uploaded: "badge-info",
  processing: "badge-processing",
  transcribing: "badge-processing",
  analyzing: "badge-processing",
  embedding: "badge-processing",
  completed: "badge-success",
  failed: "badge-error",
};

const statusText = {
  uploaded: "Uploaded",
  processing: "Processing",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  embedding: "Indexing",
  completed: "Ready",
  failed: "Failed",
};

export default function HomePage() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const fetchVideos = async () => {
    try {
      const response = await getVideos();
      if (response.success) {
        setVideos(response.data);
      }
    } catch (error) {
      console.error("Error fetching videos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();

    // Poll for status updates
    const interval = setInterval(() => {
      const hasProcessing = videos.some(
        (v) => !["completed", "failed"].includes(v.status),
      );
      if (hasProcessing) {
        fetchVideos();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [videos.length]);

  const handleUploadComplete = () => {
    setShowUpload(false);
    fetchVideos();
  };

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this video?")) {
      return;
    }

    try {
      await deleteVideo(id);
      fetchVideos();
    } catch (error) {
      console.error("Error deleting video:", error);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Loading videos...</p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1
            style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "8px" }}
          >
            Video Library
          </h1>
          <p className="text-muted">
            Upload videos to transcribe, summarize, and search with AI
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={fetchVideos}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowUpload(true)}
          >
            <Upload size={18} />
            Upload Video
          </button>
        </div>
      </div>

      {showUpload && (
        <div style={{ marginBottom: "32px" }}>
          <VideoUpload
            onComplete={handleUploadComplete}
            onCancel={() => setShowUpload(false)}
          />
        </div>
      )}

      {videos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileVideo size={40} />
          </div>
          <h3>No videos yet</h3>
          <p style={{ marginBottom: "24px" }}>
            Upload your first video to get started with AI-powered analysis
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setShowUpload(true)}
          >
            <Upload size={18} />
            Upload Video
          </button>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map((video) => (
            <Link
              to={video.status === "completed" ? `/video/${video.id}` : "#"}
              key={video.id}
              className="card"
              style={{
                textDecoration: "none",
                cursor: video.status === "completed" ? "pointer" : "default",
                opacity: video.status === "failed" ? 0.7 : 1,
              }}
            >
              <div className="flex justify-between items-center mb-4">
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    background: "var(--bg-tertiary)",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Video size={24} color="var(--accent-secondary)" />
                </div>
                <div className="flex gap-2 items-center">
                  <span className={`badge ${statusBadge[video.status]}`}>
                    {statusText[video.status]}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => handleDelete(video.id, e)}
                    style={{ padding: "8px" }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <h3
                className="truncate"
                style={{
                  fontSize: "1rem",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: "var(--text-primary)",
                }}
                title={video.originalName}
              >
                {video.originalName}
              </h3>

              <div className="flex gap-4 text-sm text-muted">
                <span className="flex items-center gap-2">
                  <Clock size={14} />
                  {formatDuration(video.duration)}
                </span>
                <span>{formatFileSize(video.fileSize)}</span>
              </div>

              <p className="text-sm text-muted" style={{ marginTop: "12px" }}>
                {formatRelativeTime(video.createdAt)}
              </p>

              {!["completed", "failed"].includes(video.status) && (
                <div style={{ marginTop: "16px" }}>
                  <div className="progress-bar">
                    <div
                      className="progress-fill pulse"
                      style={{ width: "60%" }}
                    ></div>
                  </div>
                  <p
                    className="text-sm text-muted"
                    style={{ marginTop: "8px" }}
                  >
                    {statusText[video.status]}...
                  </p>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
