import { Search, Loader } from "lucide-react";

export default function SearchBar({
  value,
  onChange,
  onSearch,
  searchType,
  onTypeChange,
  loading,
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(value);
  };

  return (
    <div>
      {/* Search Type Toggle */}
      <div className="tabs mb-4" style={{ width: "100%" }}>
        <button
          className={`tab ${searchType === "keyword" ? "active" : ""}`}
          onClick={() => onTypeChange("keyword")}
          style={{ flex: 1 }}
        >
          Keyword Search
        </button>
        <button
          className={`tab ${searchType === "semantic" ? "active" : ""}`}
          onClick={() => onTypeChange("semantic")}
          style={{ flex: 1 }}
        >
          Semantic Search
        </button>
      </div>

      <p className="text-sm text-muted mb-4">
        {searchType === "keyword"
          ? "Search for exact words and phrases in the transcript"
          : "Search by meaning - find related content even with different words"}
      </p>

      {/* Search Form */}
      <form onSubmit={handleSubmit}>
        <div className="search-container">
          <Search className="search-icon" size={18} />
          <input
            type="text"
            className="input search-input"
            placeholder={
              searchType === "keyword"
                ? "Search for keywords..."
                : "Search by meaning..."
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={loading || !value.trim()}
            style={{
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            {loading ? (
              <Loader
                size={16}
                className="spin"
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              "Search"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
