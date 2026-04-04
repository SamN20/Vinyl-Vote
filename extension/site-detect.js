(function () {
  try {
    // Mark the page so the web app can detect the extension
    document.documentElement.setAttribute('data-vv-ext', '1');
    const version = (typeof chrome !== 'undefined' && chrome?.runtime?.getManifest)
      ? (chrome.runtime.getManifest().version || 'unknown')
      : 'unknown';
    // Broadcast a custom event for anyone listening
    window.dispatchEvent(new CustomEvent('vinylvote:extension-detected', { detail: { version } }));
  } catch (_) {
    // no-op; detection is best effort
  }
})();
