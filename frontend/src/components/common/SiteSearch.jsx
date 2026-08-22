import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { FaCompactDisc, FaMusic, FaSearch, FaTimes, FaUserAlt } from "react-icons/fa";
import { siteSearch } from "../../api";
import "./SiteSearch.css";

const EMPTY_ITEMS = {
  albums: [],
  songs: [],
  artists: [],
};

const GROUPS = [
  { key: "albums", label: "Albums", icon: FaCompactDisc },
  { key: "songs", label: "Songs", icon: FaMusic },
  { key: "artists", label: "Artists", icon: FaUserAlt },
];

function countResults(items) {
  return GROUPS.reduce((total, group) => total + (items[group.key]?.length || 0), 0);
}

export default function SiteSearch({ isOpen, onClose, onNavigate }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(EMPTY_ITEMS);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setItems(EMPTY_ITEMS);
      setStatus("idle");
      setError("");
      return undefined;
    }

    let cancelled = false;

    async function loadResults() {
      setStatus("loading");
      setError("");

      try {
        const payload = await siteSearch(trimmed);
        if (cancelled) {
          return;
        }

        const nextItems = payload.items || EMPTY_ITEMS;
        setItems(nextItems);
        setStatus(countResults(nextItems) > 0 ? "ready" : "empty");
      } catch (searchError) {
        if (cancelled) {
          return;
        }

        setItems(EMPTY_ITEMS);
        setError(searchError.message || "Search failed.");
        setStatus("error");
      }
    }

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [isOpen, query]);

  if (!isOpen) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  function handleBackdropMouseDown(event) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleResultClick() {
    onNavigate?.();
    onClose();
  }

  const resultCount = countResults(items);

  return createPortal(
    <div className="site-search-backdrop" onMouseDown={handleBackdropMouseDown}>
      <section
        className="site-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-search-title"
      >
        <div className="site-search-header">
          <div>
            <p className="eyebrow">Search</p>
            <h2 id="site-search-title">Find music</h2>
          </div>
          <button className="site-search-close" type="button" onClick={onClose} aria-label="Close search">
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <label className="site-search-input-wrap">
          <span className="sr-only">Search albums, songs, and artists</span>
          <FaSearch className="site-search-input-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="site-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search albums, songs, artists"
          />
        </label>

        <div className="site-search-results" aria-live="polite">
          {status === "idle" ? (
            <p className="site-search-message">Type at least 2 characters to search Vinyl Vote.</p>
          ) : null}

          {status === "loading" ? <p className="site-search-message">Searching...</p> : null}

          {status === "error" ? <p className="site-search-message error-text">{error}</p> : null}

          {status === "empty" ? (
            <p className="site-search-message">No results found for "{query.trim()}".</p>
          ) : null}

          {status === "ready" ? (
            <>
              <p className="site-search-count">{resultCount} result{resultCount === 1 ? "" : "s"}</p>
              {GROUPS.map((group) => {
                const groupItems = items[group.key] || [];
                const Icon = group.icon;
                if (!groupItems.length) {
                  return null;
                }

                return (
                  <section className="site-search-group" key={group.key}>
                    <h3>{group.label}</h3>
                    <div className="site-search-list">
                      {groupItems.map((item) => (
                        <Link
                          className="site-search-result"
                          key={`${item.type}-${item.id || item.title}`}
                          to={item.url}
                          onClick={handleResultClick}
                        >
                          {item.cover_url ? (
                            <img src={item.cover_url} alt="" loading="lazy" />
                          ) : (
                            <span className="site-search-result-icon">
                              <Icon aria-hidden="true" />
                            </span>
                          )}
                          <span>
                            <strong>{item.title}</strong>
                            {item.subtitle ? <span>{item.subtitle}</span> : null}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
