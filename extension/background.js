const DEFAULT_SETTINGS = {
  apiOrigin: 'https://vinylvote.bynolo.ca',
  autoPrompt: true,
  remindIntervalHours: 6,
  // After-song rating prompt behavior
  afterSongPrompt: true,
  crossTabPrompt: true,
  desktopNotifications: true,
  songPromptCooldownMinutes: 60,
  notificationIconUrl: 'https://vinylvote.bynolo.ca/static/icon.png',
  // Platform toggles
  platforms: { ytmusic: true, spotify: true, apple: true },
  // Lazy voting
  lazyVoteEnabled: true,
  lazyVoteStep: 0.5,
};

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ vinylVoteSettings: DEFAULT_SETTINGS }, (result) => {
      const stored = result.vinylVoteSettings || {};
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get('vinylVoteSettings', (result) => {
    if (!result.vinylVoteSettings) {
      chrome.storage.sync.set({ vinylVoteSettings: DEFAULT_SETTINGS });
    }
  });
  setTimeout(applyBrandedActionIcon, 0);
});

chrome.runtime.onStartup?.addListener(() => {
  setTimeout(applyBrandedActionIcon, 0);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'vinylVote:apiFetch') {
    handleApiFetch(message, sender, sendResponse);
    return true;
  }
  if (message?.type === 'vinylVote:getSettings') {
    getSettings().then((settings) => sendResponse({ settings }));
    return true;
  }
  if (message?.type === 'vinylVote:updateSettings') {
    (async () => {
      const current = await getSettings();
      const updated = { ...current, ...(message?.partial || {}) };
      chrome.storage.sync.set({ vinylVoteSettings: updated }, () => {
        sendResponse({ ok: true, settings: updated });
      });
    })();
    return true;
  }
  if (message?.type === 'vinylVote:songCompleted') {
    handleSongCompleted(message, sender);
    return false;
  }
  return false;
});

// Keyboard shortcut to toggle overlay on the active tab
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'toggle-overlay') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'vinylVote:toggleOverlay' });
    }
  } catch (_) {
    // ignore
  }
});

async function handleApiFetch(message, sender, sendResponse) {
  try {
    const settings = await getSettings();
    const url = new URL(message.path, settings.apiOrigin).toString();
    const init = {
      method: message.method || 'GET',
      credentials: 'include',
      headers: message.headers || {},
    };

    if (message.body !== undefined && message.body !== null) {
      init.headers = { ...init.headers, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(message.body);
    }

    const response = await fetch(url, init);
    const contentType = response.headers.get('Content-Type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    sendResponse({ ok: response.ok, status: response.status, data });
  } catch (error) {
    console.error('Vinyl Vote extension fetch failed', error);
    sendResponse({ ok: false, status: 0, error: error?.message || String(error) });
  }
}

chrome.action.onClicked.addListener((tab) => {
  // If there's a pending rating prompt, focus that tab and show it
  if (pendingRate?.tabId) {
    const { tabId, song } = pendingRate;
    focusTab(tabId).then(() => {
      chrome.tabs.sendMessage(tabId, { type: 'vinylVote:promptForSong', song });
    });
    clearBadge();
    pendingRate = null;
    return;
  }
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'vinylVote:toggleOverlay' });
  }
});

// ---- Cross-tab reminder state ----
let pendingRate = null; // { tabId, song }
let generatedIconDataUrl = null;

function setBadge(songTitle) {
  chrome.action.setBadgeBackgroundColor({ color: '#f97316' });
  chrome.action.setBadgeText({ text: '1' });
  const title = songTitle ? `Vinyl Vote: Rate "${songTitle}"` : 'Vinyl Vote: Rate this song';
  chrome.action.setTitle({ title });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setTitle({ title: 'Vinyl Vote Companion' });
}

function focusTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (t) => {
      if (!t) return resolve();
      chrome.windows.update(t.windowId, { focused: true }, () => {
        chrome.tabs.update(tabId, { active: true }, () => resolve());
      });
    });
  });
}

// If user activates the music tab later, prompt automatically
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (pendingRate?.tabId === tabId) {
    const { song } = pendingRate;
    chrome.tabs.sendMessage(tabId, { type: 'vinylVote:promptForSong', song });
    clearBadge();
    pendingRate = null;
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (!pendingRate || windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.get(pendingRate.tabId, (t) => {
    if (!t || t.windowId !== windowId) return;
    if (t.active) {
      chrome.tabs.sendMessage(t.id, { type: 'vinylVote:promptForSong', song: pendingRate.song });
      clearBadge();
      pendingRate = null;
    }
  });
});

async function handleSongCompleted(message, sender) {
  const settings = await getSettings();
  if (!settings.afterSongPrompt) {
    return;
  }
  if (!settings.crossTabPrompt) {
    if (sender?.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, { type: 'vinylVote:promptForSong', song: message.song });
    }
    return;
  }

  const tabId = sender?.tab?.id;
  if (!tabId) return;

  chrome.tabs.get(tabId, (t) => {
    if (!t) return;
    chrome.windows.get(t.windowId, (w) => {
      const isActive = Boolean(t.active && w?.focused);
      if (isActive) {
        chrome.tabs.sendMessage(tabId, { type: 'vinylVote:promptForSong', song: message.song });
      } else {
        pendingRate = { tabId, song: message.song };
        setBadge(message.song?.title || '');
        if (settings.desktopNotifications) {
          const iconUrl = settings.notificationIconUrl || generatedIconDataUrl || DEFAULT_SETTINGS.notificationIconUrl;
          try {
            chrome.notifications?.create('vinylvote-rate', {
              type: 'basic',
              iconUrl,
              title: 'Vinyl Vote',
              message: message.song?.title ? `How was "${message.song.title}"? Click the icon to rate.` : 'How was that track? Click the icon to rate.',
              priority: 0,
              requireInteraction: false,
            });
          } catch (e) {
            // ignore notification errors
          }
        }
      }
    });
  });
}

// --- Branded icon from PNG URL ---
async function applyBrandedActionIcon() {
  try {
    const settings = await getSettings();
    const url = settings.notificationIconUrl || DEFAULT_SETTINGS.notificationIconUrl;
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error('icon fetch failed');
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const sizes = [16, 32, 48, 128];
    const imageData = {};
    for (const size of sizes) {
      imageData[size] = rasterizeBitmap(bitmap, size);
    }
    chrome.action.setIcon({ imageData });
    generatedIconDataUrl = await blobToDataUrl(scaleBitmap(bitmap, 128));
  } catch (e) {
    // ignore; fallback will be default Chrome puzzle icon
  }
}

function rasterizeBitmap(bitmap, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(bitmap, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

function scaleBitmap(bitmap, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, size, size);
  return canvas;
}

function blobToDataUrl(canvas) {
  return canvas.convertToBlob({ type: 'image/png' }).then(
    (blob) =>
      new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.readAsDataURL(blob);
      })
  );
}