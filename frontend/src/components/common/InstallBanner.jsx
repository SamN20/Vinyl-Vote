import { useEffect, useMemo, useState } from "react";
import "./InstallBanner.css";

const DISMISS_KEY = "dismiss_install_banner_v2";

function isIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isMobileDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }
  const mediaStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = Boolean(window.navigator.standalone);
  return mediaStandalone || iosStandalone;
}

function isDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "true";
  } catch (error) {
    return false;
  }
}

function persistDismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "true");
  } catch (error) {
    // Ignore storage issues in private browsing contexts.
  }
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(() => isDismissed());
  const ios = useMemo(() => isIosDevice(), []);
  const mobile = useMemo(() => isMobileDevice(), []);
  const [standalone, setStandalone] = useState(() => isStandaloneMode());

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
    }

    function onAppInstalled() {
      setStandalone(true);
      setDeferredPrompt(null);
      setDismissed(true);
      persistDismiss();
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (!mobile || standalone || dismissed) {
    return null;
  }

  const canPromptInstall = Boolean(deferredPrompt);
  const shouldShow = canPromptInstall || ios;

  if (!shouldShow) {
    return null;
  }

  async function handleInstall() {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch (error) {
      // Ignore user dismissal.
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setDismissed(true);
    persistDismiss();
  }

  return (
    <aside className="install-banner-v2" role="region" aria-label="Install Vinyl Vote app">
      <div className="install-banner-text">
        <strong>Install Vinyl Vote</strong>
        {ios ? (
          <span>Open Share, then tap Add to Home Screen for quick launch.</span>
        ) : (
          <span>Get quick access to voting and results directly from your home screen.</span>
        )}
      </div>
      <div className="install-banner-actions">
        {canPromptInstall ? (
          <button type="button" className="btn btn-primary" onClick={handleInstall}>
            Install
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={handleDismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}
