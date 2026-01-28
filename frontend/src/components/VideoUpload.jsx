import { useState, useRef } from "react";
import { Upload, X, FileVideo, Check } from "lucide-react";
import { uploadVideo } from "../hooks/useApi";

export default function VideoUpload({ onComplete, onCancel }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith("video/")) {
        setError("Please select a video file");
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (!droppedFile.type.startsWith("video/")) {
        setError("Please select a video file");
        return;
      }
      setFile(droppedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      await uploadVideo(file, setProgress);
      setSuccess(true);
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="card" style={{ position: "relative" }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onCancel}
        style={{ position: "absolute", top: "16px", right: "16px" }}
      >
        <X size={18} />
      </button>

      <h3 className="card-title mb-4">Upload Video</h3>

      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: "2px dashed var(--border-color)",
            borderRadius: "var(--border-radius)",
            padding: "48px",
            textAlign: "center",
            cursor: "pointer",
            transition: "all var(--transition-fast)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-primary)";
            e.currentTarget.style.background = "var(--bg-tertiary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              background: "var(--bg-tertiary)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Upload size={28} color="var(--accent-secondary)" />
          </div>
          <p style={{ fontWeight: 500, marginBottom: "8px" }}>
            Drop your video here or click to browse
          </p>
          <p className="text-sm text-muted">
            Supports MP4, WebM, MOV, AVI, MKV (up to 5GB)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
        </div>
      ) : (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "16px",
              background: "var(--bg-tertiary)",
              borderRadius: "var(--border-radius-sm)",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                background: success
                  ? "var(--success)"
                  : "var(--accent-primary)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {success ? (
                <Check size={24} color="white" />
              ) : (
                <FileVideo size={24} color="white" />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 500 }} className="truncate">
                {file.name}
              </p>
              <p className="text-sm text-muted">{formatFileSize(file.size)}</p>
            </div>
            {!uploading && !success && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setFile(null)}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {uploading && (
            <div style={{ marginBottom: "16px" }}>
              <div className="flex justify-between text-sm mb-2">
                <span>Uploading...</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}

          {success && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(16, 185, 129, 0.15)",
                borderRadius: "var(--border-radius-sm)",
                color: "var(--success)",
                marginBottom: "16px",
              }}
            >
              ✓ Video uploaded successfully! Processing will begin shortly.
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(239, 68, 68, 0.15)",
                borderRadius: "var(--border-radius-sm)",
                color: "var(--error)",
                marginBottom: "16px",
              }}
            >
              {error}
            </div>
          )}

          {!success && (
            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-secondary"
                onClick={onCancel}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Upload & Process"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
