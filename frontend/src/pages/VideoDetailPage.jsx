import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  ListChecks,
  Bookmark,
  Search,
  Sparkles,
  Play,
  Check,
  Circle,
  Clock,
} from "lucide-react";
import {
  getVideo,
  getTranscript,
  getSummary,
  getNotes,
  getTodos,
  getChapters,
  keywordSearch,
  semanticSearch,
  toggleTodo,
  getVideoStreamUrl,
  getHighlights,
  getHighlightStreamUrl,
} from "../hooks/useApi";
import VideoPlayer from "../components/VideoPlayer";
import TranscriptView from "../components/TranscriptView";
import ChapterList from "../components/ChapterList";
import SearchBar from "../components/SearchBar";
import { formatTime, formatDuration } from "../utils/formatTime";

const TABS = [
  { id: "summary", label: "Summary", icon: FileText },
  { id: "transcript", label: "Transcript", icon: FileText },
  { id: "notes", label: "Notes", icon: Bookmark },
  { id: "todos", label: "Action Items", icon: ListChecks },
  { id: "search", label: "Search", icon: Search },
  { id: "highlights", label: "Highlights", icon: Sparkles },
];

export default function VideoDetailPage() {
  const { id } = useParams();
  const videoRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);

  // Data states
  const [transcript, setTranscript] = useState(null);
  const [summary, setSummary] = useState(null);
  const [notes, setNotes] = useState([]);
  const [todos, setTodos] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [highlights, setHighlights] = useState(null);

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("keyword");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchVideoData();
  }, [id]);

  const fetchVideoData = async () => {
    try {
      setLoading(true);

      const [
        videoRes,
        transcriptRes,
        summaryRes,
        notesRes,
        todosRes,
        chaptersRes,
        highlightsRes,
      ] = await Promise.allSettled([
        getVideo(id),
        getTranscript(id),
        getSummary(id),
        getNotes(id),
        getTodos(id),
        getChapters(id),
        getHighlights(id),
      ]);

      if (videoRes.status === "fulfilled" && videoRes.value.success) {
        setVideo(videoRes.value.data);
      }
      if (transcriptRes.status === "fulfilled" && transcriptRes.value.success) {
        setTranscript(transcriptRes.value.data);
      }
      if (summaryRes.status === "fulfilled" && summaryRes.value.success) {
        setSummary(summaryRes.value.data);
      }
      if (notesRes.status === "fulfilled" && notesRes.value.success) {
        setNotes(notesRes.value.data.notes);
      }
      if (todosRes.status === "fulfilled" && todosRes.value.success) {
        setTodos(todosRes.value.data.todos);
      }
      if (chaptersRes.status === "fulfilled" && chaptersRes.value.success) {
        setChapters(chaptersRes.value.data.chapters);
      }
      if (highlightsRes.status === "fulfilled" && highlightsRes.value.success) {
        setHighlights(highlightsRes.value.data);
      }
    } catch (error) {
      console.error("Error fetching video data:", error);
    } finally {
      setLoading(false);
    }
  };

  const seekTo = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const searchFn =
        searchType === "keyword" ? keywordSearch : semanticSearch;
      const response = await searchFn(query, id);
      if (response.success) {
        setSearchResults(response.data.results);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleToggleTodo = async (todoId) => {
    try {
      await toggleTodo(id, todoId);
      setTodos(
        todos.map((t) =>
          t.id === todoId ? { ...t, completed: !t.completed } : t,
        ),
      );
    } catch (error) {
      console.error("Error toggling todo:", error);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Loading video data...</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="empty-state">
        <h3>Video not found</h3>
        <Link to="/" className="btn btn-primary mt-4">
          <ArrowLeft size={18} />
          Back to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <Link to="/" className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
          Back
        </Link>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            {video.originalName}
          </h1>
          <p className="text-sm text-muted">{formatDuration(video.duration)}</p>
        </div>
      </div>

      {/* Main Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 400px",
          gap: "24px",
        }}
      >
        {/* Left Column - Video + Content */}
        <div>
          {/* Video Player */}
          <div style={{ marginBottom: "24px" }}>
            <VideoPlayer
              ref={videoRef}
              src={getVideoStreamUrl(id)}
              chapters={chapters}
              onTimeUpdate={setCurrentTime}
              onSeek={seekTo}
            />
          </div>

          {/* Tabs */}
          <div className="tabs mb-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={16} style={{ marginRight: "6px" }} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="card">
            {activeTab === "summary" && (
              <div>
                <h3 className="card-title mb-4">Summary</h3>
                {summary ? (
                  <>
                    <div
                      style={{
                        background: "var(--bg-tertiary)",
                        padding: "16px",
                        borderRadius: "var(--border-radius-sm)",
                        marginBottom: "16px",
                      }}
                    >
                      <p style={{ fontWeight: 500 }}>{summary.briefSummary}</p>
                    </div>
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
                      {summary.fullSummary}
                    </p>
                  </>
                ) : (
                  <p className="text-muted">No summary available</p>
                )}
              </div>
            )}

            {activeTab === "transcript" && (
              <TranscriptView
                segments={transcript?.segments || []}
                currentTime={currentTime}
                onSeek={seekTo}
              />
            )}

            {activeTab === "notes" && (
              <div>
                <h3 className="card-title mb-4">Key Notes</h3>
                {notes.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {notes.map((note, i) => (
                      <div
                        key={note.id}
                        className="flex gap-4"
                        style={{
                          padding: "16px",
                          background: "var(--bg-tertiary)",
                          borderRadius: "var(--border-radius-sm)",
                          cursor: note.startTime ? "pointer" : "default",
                        }}
                        onClick={() => note.startTime && seekTo(note.startTime)}
                      >
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            background: "var(--accent-primary)",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {i + 1}
                        </div>
                        <div>
                          <p>{note.content}</p>
                          {note.startTime && (
                            <p className="text-sm text-muted mt-2 flex items-center gap-2">
                              <Clock size={14} />
                              {formatTime(note.startTime)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted">No notes available</p>
                )}
              </div>
            )}

            {activeTab === "todos" && (
              <div>
                <h3 className="card-title mb-4">Action Items</h3>
                {todos.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {todos.map((todo) => (
                      <div
                        key={todo.id}
                        className="flex items-center gap-4"
                        style={{
                          padding: "12px 16px",
                          background: "var(--bg-tertiary)",
                          borderRadius: "var(--border-radius-sm)",
                        }}
                      >
                        <button
                          onClick={() => handleToggleTodo(todo.id)}
                          style={{
                            width: "24px",
                            height: "24px",
                            border: todo.completed
                              ? "none"
                              : "2px solid var(--border-color)",
                            borderRadius: "6px",
                            background: todo.completed
                              ? "var(--success)"
                              : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          {todo.completed && <Check size={14} color="white" />}
                        </button>
                        <div style={{ flex: 1 }}>
                          <p
                            style={{
                              textDecoration: todo.completed
                                ? "line-through"
                                : "none",
                              opacity: todo.completed ? 0.6 : 1,
                            }}
                          >
                            {todo.content}
                          </p>
                        </div>
                        <span
                          className={`badge ${
                            todo.priority === "high"
                              ? "badge-error"
                              : todo.priority === "medium"
                                ? "badge-warning"
                                : "badge-info"
                          }`}
                        >
                          {todo.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted">No action items found</p>
                )}
              </div>
            )}

            {activeTab === "search" && (
              <div>
                <h3 className="card-title mb-4">Search Video</h3>
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleSearch}
                  searchType={searchType}
                  onTypeChange={setSearchType}
                  loading={searching}
                />

                {searchResults.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4">
                    {searchResults.map((result, i) => (
                      <div
                        key={i}
                        onClick={() => seekTo(result.startTime)}
                        style={{
                          padding: "12px 16px",
                          background: "var(--bg-tertiary)",
                          borderRadius: "var(--border-radius-sm)",
                          cursor: "pointer",
                          transition: "all var(--transition-fast)",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--bg-hover)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            "var(--bg-tertiary)")
                        }
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="flex items-center gap-2 text-sm">
                            <Play size={14} color="var(--accent-secondary)" />
                            {formatTime(result.startTime)}
                          </span>
                          {result.similarity && (
                            <span className="badge badge-info">
                              {Math.round(result.similarity * 100)}% match
                            </span>
                          )}
                        </div>
                        <p className="text-sm">{result.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {searchQuery && searchResults.length === 0 && !searching && (
                  <p className="text-muted mt-4">No results found</p>
                )}
              </div>
            )}

            {activeTab === "highlights" && (
              <div>
                <h3 className="card-title mb-4">Highlight Reel</h3>
                {highlights?.status === "completed" ? (
                  <div>
                    <video
                      controls
                      style={{
                        width: "100%",
                        borderRadius: "var(--border-radius-sm)",
                        marginBottom: "16px",
                      }}
                    >
                      <source
                        src={getHighlightStreamUrl(id)}
                        type="video/mp4"
                      />
                    </video>
                    <h4 style={{ fontWeight: 500, marginBottom: "12px" }}>
                      Included Clips:
                    </h4>
                    <div className="flex flex-col gap-2">
                      {highlights.clips?.map((clip, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "12px",
                            background: "var(--bg-tertiary)",
                            borderRadius: "var(--border-radius-sm)",
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="badge badge-processing">
                              {formatTime(clip.startTime)} -{" "}
                              {formatTime(clip.endTime)}
                            </span>
                          </div>
                          <p className="text-sm">{clip.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : highlights?.status === "generating" ? (
                  <div className="loading-container">
                    <div className="loader"></div>
                    <p>Generating highlight video...</p>
                  </div>
                ) : (
                  <p className="text-muted">No highlights available</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Chapters */}
        <div>
          <ChapterList
            chapters={chapters}
            currentTime={currentTime}
            onSeek={seekTo}
          />
        </div>
      </div>
    </div>
  );
}
