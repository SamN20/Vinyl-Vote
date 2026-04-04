const DEFAULT_SETTINGS = {
  apiOrigin: 'https://vinylvote.bynolo.ca',
  autoPrompt: true,
  remindIntervalHours: 6,
  afterSongPrompt: true,
  crossTabPrompt: true,
  desktopNotifications: true,
  songPromptCooldownMinutes: 60,
  notificationIconUrl: 'https://vinylvote.bynolo.ca/static/icon.png',
  platforms: { ytmusic: true, spotify: true, apple: true },
  lazyVoteEnabled: true,
  lazyVoteStep: 0.5,
};

function loadSettings() {
  chrome.storage.sync.get({ vinylVoteSettings: DEFAULT_SETTINGS }, (result) => {
    const settings = { ...DEFAULT_SETTINGS, ...(result.vinylVoteSettings || {}) };
    document.getElementById('apiOrigin').value = settings.apiOrigin;
    document.getElementById('autoPrompt').checked = Boolean(settings.autoPrompt);
    document.getElementById('remindIntervalHours').value = settings.remindIntervalHours;
    document.getElementById('afterSongPrompt').checked = Boolean(settings.afterSongPrompt);
    document.getElementById('crossTabPrompt').checked = Boolean(settings.crossTabPrompt);
    document.getElementById('desktopNotifications').checked = Boolean(settings.desktopNotifications);
    document.getElementById('songPromptCooldownMinutes').value = Number(settings.songPromptCooldownMinutes) || 60;
    document.getElementById('notificationIconUrl').value = settings.notificationIconUrl || '';
    document.getElementById('platform-ytmusic').checked = Boolean(settings.platforms?.ytmusic);
    document.getElementById('platform-spotify').checked = Boolean(settings.platforms?.spotify);
    document.getElementById('platform-apple').checked = Boolean(settings.platforms?.apple);
    document.getElementById('lazyVoteEnabled').checked = Boolean(settings.lazyVoteEnabled);
    document.getElementById('lazyVoteStep').value = settings.lazyVoteStep;
  });
}

function saveSettings(event) {
  event.preventDefault();
  const apiOriginInput = document.getElementById('apiOrigin');
  const status = document.getElementById('saveStatus');

  try {
    const url = new URL(apiOriginInput.value);
    if (!url.protocol.startsWith('http')) {
      throw new Error('Only http(s) URLs are allowed.');
    }
  } catch (error) {
    status.textContent = 'Please enter a valid Vinyl Vote site URL.';
    status.className = 'error';
    return;
  }

  const settings = {
    apiOrigin: apiOriginInput.value.replace(/\/$/, ''),
    autoPrompt: document.getElementById('autoPrompt').checked,
    remindIntervalHours: Number(document.getElementById('remindIntervalHours').value) || DEFAULT_SETTINGS.remindIntervalHours,
    afterSongPrompt: document.getElementById('afterSongPrompt').checked,
    crossTabPrompt: document.getElementById('crossTabPrompt').checked,
    desktopNotifications: document.getElementById('desktopNotifications').checked,
    songPromptCooldownMinutes: Number(document.getElementById('songPromptCooldownMinutes').value) || 60,
    notificationIconUrl: document.getElementById('notificationIconUrl').value.trim(),
    platforms: {
      ytmusic: document.getElementById('platform-ytmusic').checked,
      spotify: document.getElementById('platform-spotify').checked,
      apple: document.getElementById('platform-apple').checked,
    },
    lazyVoteEnabled: document.getElementById('lazyVoteEnabled').checked,
    lazyVoteStep: Number(document.getElementById('lazyVoteStep').value) || DEFAULT_SETTINGS.lazyVoteStep,
  };

  chrome.storage.sync.set({ vinylVoteSettings: settings }, () => {
    status.textContent = 'Saved!';
    status.className = 'success';
    setTimeout(() => {
      status.textContent = '';
      status.className = '';
    }, 2000);
  });
}

document.getElementById('options-form').addEventListener('submit', saveSettings);
document.addEventListener('DOMContentLoaded', loadSettings);