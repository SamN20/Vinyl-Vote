import { useEffect, useState } from "react";
import { legacyPageHref } from "../../api";
import "./ExtensionInstallChip.css";

const DISMISS_KEY = "vv_ext_chip_dismiss_v1";

function isChromiumLikeDesktop() {
  const ua = navigator.userAgent || "";
  const chromiumVendors = /(Chrome|CriOS|Edg|OPR|Vivaldi)/i.test(ua);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  return chromiumVendors && !isMobile;
}

function isPwaMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
}

function hasExtensionMark() {
  return document.documentElement.getAttribute("data-vv-ext") === "1";
}

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function persistDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch (error) {
    // Ignore storage write failures in restricted browsing modes.
  }
}

export default function ExtensionInstallChip({ route }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function maybeShowChip() {
      if (route === "/extension") {
        setVisible(false);
        return;
      }

      if (!isChromiumLikeDesktop()) {
        setVisible(false);
        return;
      }

      if (isPwaMode()) {
        setVisible(false);
        return;
      }

      if (window.matchMedia("(max-width: 700px)").matches) {
        setVisible(false);
        return;
      }

      if (wasDismissed() || hasExtensionMark()) {
        setVisible(false);
        return;
      }

      setVisible(true);
    }

    function hideOnExtensionDetect() {
      setVisible(false);
    }

    maybeShowChip();
    const timeoutId = window.setTimeout(maybeShowChip, 200);

    window.addEventListener("load", maybeShowChip);
    window.addEventListener("resize", maybeShowChip);
    window.addEventListener("vinylvote:extension-detected", hideOnExtensionDetect);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("load", maybeShowChip);
      window.removeEventListener("resize", maybeShowChip);
      window.removeEventListener("vinylvote:extension-detected", hideOnExtensionDetect);
    };
  }, [route]);

  function handleDismiss() {
    persistDismissal();
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="vv-ext-chip" role="status" aria-live="polite">
      <button type="button" className="vv-ext-chip__close" aria-label="Dismiss" onClick={handleDismiss}>
        &times;
      </button>
      <div className="vv-ext-chip__text">
        <strong>Get the Vinyl Vote Companion</strong>
        <span className="vv-ext-chip__sub">Quick voting from Spotify, Apple Music, and YouTube</span>
      </div>
      <a className="vv-ext-chip__cta" href={legacyPageHref("/extension")} target="_blank" rel="noopener noreferrer">
        Install
      </a>
    </div>
  );
}
