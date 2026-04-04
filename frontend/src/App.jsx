import { useEffect, useState } from "react";

function App() {
  const [album, setAlbum] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    async function loadCurrentAlbum() {
      try {
        const response = await fetch("/api/current-album");
        if (!response.ok) {
          throw new Error("Failed to fetch current album");
        }
        const data = await response.json();
        setAlbum(data);
        setStatus("ready");
      } catch (error) {
        setStatus("error");
      }
    }

    loadCurrentAlbum();
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Vinyl Vote V2</p>
        <h1>React Frontend Bootstrapped</h1>
        <p className="subtitle">
          This is the new frontend shell. Next step is migrating voting, results,
          and authentication screens from server-rendered templates.
        </p>
      </section>

      <section className="card">
        {status === "loading" && <p>Loading current album...</p>}
        {status === "error" && (
          <p>
            Could not load album data yet. Confirm Flask is running and `/api/current-album`
            returns JSON.
          </p>
        )}
        {status === "ready" && (
          <div>
            <h2>Current Album</h2>
            <p>
              <strong>Title:</strong> {album?.name || "Unknown"}
            </p>
            <p>
              <strong>Artist:</strong> {album?.artist || "Unknown"}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
