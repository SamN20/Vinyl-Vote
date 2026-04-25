import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { legacyPageHref, logoutHref } from "../../api";
import "./Header.css";

function isMobileWidth() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(max-width: 900px)").matches;
}

function ChevronDownIcon({ className = "" }) {
  return (
    <svg className={`icon-inline ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusCircleIcon({ className = "" }) {
  return (
    <svg className={`icon-inline ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="icon-inline" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="icon-inline" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21 14.5A9 9 0 1 1 9.5 3a7 7 0 1 0 11.5 11.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Header({
  loginHref,
  route,
  sessionInfo,
  sessionState,
  theme,
  toggleTheme,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dataDropdownOpen, setDataDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const closeMobileOverlays = useCallback(() => {
    if (!isMobileWidth()) {
      return;
    }
    setMenuOpen(false);
    setDataDropdownOpen(false);
    setUserDropdownOpen(false);
  }, []);

  const toggleDataDropdown = useCallback((event) => {
    if (!isMobileWidth()) {
      return;
    }
    event.preventDefault();
    setDataDropdownOpen((open) => !open);
  }, []);

  const toggleUserDropdown = useCallback((event) => {
    if (!isMobileWidth()) {
      return;
    }
    event.preventDefault();
    setUserDropdownOpen((open) => !open);
  }, []);

  return (
    <header className="site-header">
      <div className="header-container">
        <Link className="brand-link" to="/home" onClick={closeMobileOverlays}>
          <img
            src={legacyPageHref("/static/favicon_64x64.png")}
            alt="Vinyl Vote logo"
            width="40"
            height="40"
            className="brand-logo"
          />
          <span>
            Vinyl Vote <span className="brand-footnote"><span className="gradient-text">byNolo</span></span>
          </span>
        </Link>

        <button
          className="mobile-menu-toggle"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen ? "true" : "false"}
          aria-controls="v2-nav"
        >
          ☰
        </button>

        <nav id="v2-nav" className={`nav-links ${menuOpen ? "open" : ""}`}>
          <div className="nav-group primary-group">
            <Link to="/home" className={route === "/home" ? "active" : ""} onClick={closeMobileOverlays}>Home</Link>

            {sessionState === "authenticated" && (
              <>
                <Link to="/vote" className={route === "/vote" ? "active" : ""} onClick={closeMobileOverlays}>Vote</Link>
                <Link to="/battle" className={route === "/battle" ? "active" : ""} onClick={closeMobileOverlays}>Face-Off</Link>
                <Link to="/retro-hub" className={route === "/retro-hub" || route === "/retro-vote" ? "active" : ""} onClick={closeMobileOverlays}>Retro Hub</Link>
              </>
            )}

            <div className={`dropdown ${dataDropdownOpen ? "open" : ""}`}>
              <button
                className="dropbtn"
                type="button"
                aria-haspopup="true"
                aria-expanded={dataDropdownOpen ? "true" : "false"}
                onClick={toggleDataDropdown}
              >
                Data <ChevronDownIcon className="icon-right" />
              </button>
              <div className="dropdown-content">
                <Link to="/results" className={route === "/results" ? "active" : ""} onClick={closeMobileOverlays}>Weekly Results</Link>
                <div className="dropdown-divider" />
                <Link to="/top-albums" className={route === "/top-albums" ? "active" : ""} onClick={closeMobileOverlays}>Top Albums</Link>
                <Link to="/top-artists" className={route === "/top-artists" ? "active" : ""} onClick={closeMobileOverlays}>Top Artists</Link>
                <Link to="/top-songs" className={route === "/top-songs" ? "active" : ""} onClick={closeMobileOverlays}>Top Songs</Link>
                <Link to="/faceoff-leaderboard" className={route === "/faceoff-leaderboard" ? "active" : ""} onClick={closeMobileOverlays}>Face-Off Leaderboard</Link>
              </div>
            </div>
          </div>

          <div className="nav-group user-group">
            {sessionState === "authenticated" ? (
              <>
                <Link to="/song-requests" className={`nav-btn request-btn ${route === "/song-requests" ? "active" : ""}`} onClick={closeMobileOverlays}>
                  <PlusCircleIcon className="icon-left" />
                  Request
                </Link>

                <div className={`dropdown user-dropdown ${userDropdownOpen ? "open" : ""}`}>
                  <button
                    className="dropbtn user-dropbtn"
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={userDropdownOpen ? "true" : "false"}
                    onClick={toggleUserDropdown}
                  >
                    <span className="user-avatar-small">
                      {(sessionInfo?.username || "U").slice(0, 1).toUpperCase()}
                    </span>
                    <ChevronDownIcon className="icon-right" />
                  </button>
                  <div className="dropdown-content dropdown-right">
                    <div className="dropdown-header">
                      Signed in as <strong>{sessionInfo?.username || "user"}</strong>
                    </div>
                    <Link to="/profile" className={route === "/profile" ? "active" : ""} onClick={closeMobileOverlays}>Profile</Link>
                    {sessionInfo?.is_admin ? (
                      <a href={legacyPageHref("/admin/")} onClick={closeMobileOverlays}>Admin</a>
                    ) : null}
                    <div className="dropdown-divider" />
                    <a href={logoutHref()} onClick={closeMobileOverlays}>Sign Out</a>
                  </div>
                </div>
              </>
            ) : (
              <>
                <a className="nav-btn login-btn" href={loginHref} onClick={closeMobileOverlays}>Login</a>
              </>
            )}

            <button
              className="theme-toggle-icon"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
