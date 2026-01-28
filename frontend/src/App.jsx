import { Routes, Route } from "react-router-dom";
import { Video } from "lucide-react";
import HomePage from "./pages/HomePage";
import VideoDetailPage from "./pages/VideoDetailPage";

function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <a href="/" className="logo">
            <div className="logo-icon">
              <Video size={24} color="white" />
            </div>
            AI Video Intelligence
          </a>
        </div>
      </header>

      <main
        className="app-container"
        style={{ paddingTop: "32px", paddingBottom: "48px" }}
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/video/:id" element={<VideoDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
