const DEFAULT_SETTINGS = {
  apiOrigin: 'https://vinylvote.bynolo.ca',
  autoPrompt: true,
  remindIntervalHours: 6,
  afterSongPrompt: true,
  crossTabPrompt: true,
  desktopNotifications: true,
  songPromptCooldownMinutes: 60,
  notificationIconUrl: '',
  platforms: { ytmusic: true, spotify: true, apple: true },
  lazyVoteEnabled: true,
  lazyVoteStep: 0.5,
};

const SUPPORTED_HOSTS = {
  'open.spotify.com': { key: 'spotify_url', label: 'Open on Spotify' },
  'music.apple.com': { key: 'apple_url', label: 'Open in Apple Music' },
  'music.youtube.com': { key: 'youtube_url', label: 'Open on YouTube Music' },
};

const OVERLAY_ID = 'vinyl-vote-overlay';
const FAB_ID = 'vinyl-vote-fab';
const SONG_PROMPT_ID = 'vinyl-vote-song-prompt';

const state = {
  settings: null,
  album: null,
  user: null,
  voteEnd: null,
  platform: null,
  overlay: null,
  countdownTimer: null,
  draft: { song_scores: {}, album_score: '' },
  authRequired: false,
  albumFetched: false,
  nowPlaying: { title: null, artist: null },
  currentMatchedSong: null,
};

(function bootstrap() {
  const host = window.location.hostname;
  state.platform = SUPPORTED_HOSTS[host];
  if (!state.platform) {
    return;
  }

  document.addEventListener('DOMContentLoaded', initExtension);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initExtension();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'vinylVote:toggleOverlay') {
      handleManualToggle();
    }
  });
})();

async function initExtension() {
  if (state.settings) {
    return;
  }
  state.settings = await getSettings();
  await fetchAlbumData();
  injectFab();
  startNowPlayingWatcher();

  if (state.authRequired) {
    if (state.settings.autoPrompt) {
      showOverlay({ reason: 'auto' });
    }
    return;
  }

  if (!state.album) {
    return;
  }

  if (state.settings.autoPrompt) {
    const shouldPrompt = await shouldPromptForAlbum(state.album.id);
    if (shouldPrompt && !state.user?.has_voted) {
      showOverlay({ reason: 'auto' });
    }
  }
}

async function handleManualToggle() {
  if (state.overlay) {
    closeOverlay();
    return;
  }

  if (!state.albumFetched) {
    await fetchAlbumData();
  }

  if (!state.album && !state.authRequired) {
    console.warn('Vinyl Vote: No album data available for the overlay.');
    return;
  }

  showOverlay({ reason: 'manual' });
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'vinylVote:getSettings' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Vinyl Vote: failed to load settings', chrome.runtime.lastError);
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }
      resolve({ ...DEFAULT_SETTINGS, ...(response?.settings || {}) });
    });
  });
}

function updateSettings(partial) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'vinylVote:updateSettings', partial }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Vinyl Vote: failed to update settings', chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve(response?.settings || null);
    });
  });
}

async function fetchAlbumData() {
  state.albumFetched = true;
  const response = await apiFetch('/api/current-album');
  if (!response.ok) {
    if (response.status === 401) {
      state.authRequired = true;
      state.album = null;
      state.user = null;
      updateFabState();
    }
    return;
  }

  const data = response.data;
  state.authRequired = false;
  state.album = data.album;
  state.voteEnd = data.vote_end;
  state.user = data.user;
  await hydrateDraft();
  updateFabState();
}

function apiFetch(path, options = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'vinylVote:apiFetch',
        path,
        method: options.method || 'GET',
        body: options.body ?? null,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Vinyl Vote: API request failed', chrome.runtime.lastError);
          resolve({ ok: false, status: 0, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, status: 0 });
      }
    );
  });
}

async function hydrateDraft() {
  const baseDraft = createDraftFromUser();
  const stored = await loadStoredDraft(state.album.id);
  state.draft = mergeDraft(baseDraft, stored);
}

function createDraftFromUser() {
  const draft = { song_scores: {}, album_score: '' };
  if (!state.album) {
    return draft;
  }

  const votes = state.user?.song_votes || {};
  state.album.songs.forEach((song) => {
    const key = String(song.id);
    if (votes[key] !== undefined && votes[key] !== null) {
      draft.song_scores[song.id] = Number(votes[key]);
    }
  });

  if (state.user?.album_score !== undefined && state.user?.album_score !== null) {
    draft.album_score = Number(state.user.album_score);
  }

  return draft;
}

function mergeDraft(baseDraft, storedDraft) {
  const merged = {
    song_scores: { ...baseDraft.song_scores },
    album_score: baseDraft.album_score,
  };

  if (!storedDraft) {
    return merged;
  }

  if (storedDraft.song_scores) {
    for (const [key, value] of Object.entries(storedDraft.song_scores)) {
      if (value === '' || value === null || value === undefined) {
        continue;
      }
      const numericKey = Number(key);
      merged.song_scores[numericKey] = Number(value);
    }
  }

  if (storedDraft.album_score !== undefined && storedDraft.album_score !== null && storedDraft.album_score !== '') {
    merged.album_score = Number(storedDraft.album_score);
  }

  return merged;
}

function loadStoredDraft(albumId) {
  return new Promise((resolve) => {
    const key = draftKey(albumId);
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] || null);
    });
  });
}

function persistDraft() {
  if (!state.album) {
    return;
  }
  const key = draftKey(state.album.id);
  const payload = {
    song_scores: {},
    album_score: state.draft.album_score === '' ? '' : Number(state.draft.album_score),
  };

  for (const [songId, value] of Object.entries(state.draft.song_scores)) {
    payload.song_scores[songId] = value === '' ? '' : Number(value);
  }

  chrome.storage.local.set({ [key]: payload });
}

function clearDraftStorage() {
  if (!state.album) {
    return;
  }
  chrome.storage.local.remove(draftKey(state.album.id));
}

function draftKey(albumId) {
  return `vinylVote:draft:${albumId}`;
}

async function shouldPromptForAlbum(albumId) {
  const key = reminderKey(albumId);
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(key, (value) => resolve(value[key] || null));
  });

  if (!result) {
    return true;
  }

  const intervalHours = Number(state.settings?.remindIntervalHours || DEFAULT_SETTINGS.remindIntervalHours);
  const intervalMs = Math.max(intervalHours, 1) * 60 * 60 * 1000;
  return Date.now() - result > intervalMs;
}

function recordPrompt(albumId) {
  if (!albumId) {
    return;
  }
  chrome.storage.local.set({ [reminderKey(albumId)]: Date.now() });
}

function reminderKey(albumId) {
  return `vinylVote:lastPrompt:${albumId}`;
}

function showOverlay({ reason } = {}) {
  if (state.overlay) {
    closeOverlay();
  }

  if (!state.authRequired && !state.album) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'presentation');

  const content = state.authRequired ? renderAuthContent() : renderAlbumContent();
  overlay.innerHTML = `
    <div class="vv-backdrop"></div>
    <div class="vv-modal" role="dialog" aria-modal="true" aria-labelledby="vinyl-vote-title">
      ${content}
    </div>
  `;

  document.body.appendChild(overlay);
  state.overlay = overlay;

  const closeButton = overlay.querySelector('.vv-close');
  if (closeButton) {
    closeButton.addEventListener('click', closeOverlay);
  }

  overlay.querySelector('.vv-backdrop')?.addEventListener('click', closeOverlay);

  overlay.querySelectorAll('[data-action="open-platform"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openPlatformLink();
    });
  });

  overlay.querySelectorAll('[data-action="open-vinyl"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openVinylSite();
    });
  });

  overlay.querySelectorAll('[data-action="open-next-vote"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openNextVotePage();
    });
  });

  overlay.querySelectorAll('[data-action="open-retro"]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      await showRetroList();
    });
  });

  if (!state.authRequired) {
    setupFormInteractions(overlay);
    if (state.voteEnd) {
      startCountdown(overlay.querySelector('.vv-countdown'));
    }
  }

  if (state.album) {
    recordPrompt(state.album.id);
  }
}

function closeOverlay() {
  if (state.overlay) {
    state.overlay.remove();
    state.overlay = null;
  }
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
}

function renderAuthContent() {
  return `
    <div class="vv-panel">
      <button type="button" class="vv-close" aria-label="Close Vinyl Vote reminder">&times;</button>
      <h2 id="vinyl-vote-title">Sign in to Vinyl Vote</h2>
      <p class="vv-intro">Log in on the Vinyl Vote website so the extension can load the current album and save your votes.</p>
      <div class="vv-actions">
        <button class="vv-btn vv-primary" data-action="open-vinyl">Open Vinyl Vote</button>
      </div>
    </div>
  `;
}

function renderAlbumContent() {
  const album = state.album;
  const hasVoted = Boolean(state.user?.has_voted);
  const statusMessage = hasVoted
    ? 'You have already voted this week. Feel free to tweak your scores below.'
    : "You haven't submitted votes yet this week.";

  return `
    <div class="vv-panel">
      <button type="button" class="vv-close" aria-label="Close Vinyl Vote reminder">&times;</button>
      <header class="vv-header">
        <img class="vv-cover" src="${encodeURI(album.cover_url || '')}" alt="${escapeHtml(album.title)} cover art" />
        <div class="vv-header-meta">
          <h2 id="vinyl-vote-title">${escapeHtml(album.title)}</h2>
          <p class="vv-artist">${escapeHtml(album.artist)}</p>
          ${state.voteEnd ? '<p class="vv-deadline">Voting ends in <span class="vv-countdown">--</span></p>' : ''}
        </div>
      </header>
      <p class="vv-intro">${statusMessage}</p>
      <div class="vv-actions">
        ${renderPlatformButton()}
        <button class="vv-btn" data-action="open-vinyl">Open Vinyl Vote</button>
        ${state.user?.has_voted ? '<button class="vv-btn" data-action="open-next-vote">Vote next album</button>' : ''}
        ${state.user?.has_voted ? '<button class="vv-btn" data-action="open-retro">Retro albums</button>' : ''}
        <label class="vv-toggle">
          <input type="checkbox" id="vv-lazy-toggle" ${state.settings?.lazyVoteEnabled ? 'checked' : ''} />
          <span>Lazy voting</span>
        </label>
      </div>
      ${renderVoteForm()}
    </div>
  `;
}

function renderPlatformButton() {
  const platformUrl = getPlatformUrl();
  if (!platformUrl) {
    return '';
  }
  return `<button class="vv-btn vv-primary" data-action="open-platform">${state.platform.label}</button>`;
}

function renderVoteForm() {
  const songs = state.album?.songs || [];
  const lazy = Boolean(state.settings?.lazyVoteEnabled);
  const step = Number(state.settings?.lazyVoteStep || 0.5);
  const rows = songs
    .map((song) => {
      const prefix = song.track_number ? `${song.track_number}. ` : '';
      const control = lazy
        ? `<div class="vv-stars" data-stars-for="${song.id}">${renderStarInputs(step)}</div>`
        : `<input type="number" min="0" max="5" step="0.1" inputmode="decimal" required data-song-input="${song.id}" />`;
      return `
        <label class="vv-song" data-song="${song.id}">
          <span>${prefix}${escapeHtml(song.title)}</span>
          ${control}
        </label>
      `;
    })
    .join('');

  return `
    <form id="vinyl-vote-form">
      <div class="vv-song-list">${rows}</div>
      <label class="vv-album-score">
        <span>Your overall album score (0 – 5)</span>
        ${lazy ? `<div class="vv-stars" data-stars-for="album">${renderStarInputs(step)}</div>` : `<input type="number" min="0" max="5" step="0.1" inputmode="decimal" required id="vv-album-score" />`}
      </label>
      <p class="vv-note">Changes are stored locally until you hit "Save my votes".</p>
      <div class="vv-status" role="status"></div>
      <div class="vv-form-actions">
        <button type="submit" class="vv-submit">Save my votes</button>
      </div>
    </form>
  `;
}

function setupFormInteractions(container) {
  const form = container.querySelector('#vinyl-vote-form');
  if (!form) {
    return;
  }

  applyDraftToForm(form);

  const statusEl = form.querySelector('.vv-status');
  if (state.user?.has_voted) {
    setStatus(statusEl, 'Your latest Vinyl Vote scores are loaded below.', 'success');
  } else {
    setStatus(statusEl, 'Fill in your scores and press "Save my votes" when you\'re ready.', 'info');
  }

  // Wire numeric inputs, if present
  form.querySelectorAll('[data-song-input]').forEach((input) => {
    input.addEventListener('input', () => {
      const songId = Number(input.getAttribute('data-song-input'));
      const value = input.value.trim();
      if (value === '') {
        delete state.draft.song_scores[songId];
      } else {
        state.draft.song_scores[songId] = Number(value);
      }
      persistDraft();
      setStatus(statusEl, 'Unsaved changes', 'pending');
    });
  });

  // Wire five-stars + half inputs, if present
  form.querySelectorAll('.vv-stars').forEach((wrap) => {
    const forId = wrap?.getAttribute('data-stars-for');
    const group = wrap.querySelector('.vv-stars-group');
    if (!group) return;
    const stars = Array.from(group.querySelectorAll('.vv-star'));
    const halfBtn = group.querySelector('.vv-half');

    const getCurrent = () => {
      if (forId === 'album') return state.draft.album_score;
      const sid = Number(forId);
      return state.draft.song_scores[sid];
    };
    const setCurrent = (val) => {
      const v = Math.max(0, Math.min(5, Number(val)));
      if (forId === 'album') {
        state.draft.album_score = v;
      } else if (forId) {
        state.draft.song_scores[Number(forId)] = v;
      }
      persistDraft();
      setStatus(statusEl, 'Unsaved changes', 'pending');
      updateStarsGroupUI(group, v);
    };

    // Initialize UI from draft
    updateStarsGroupUI(group, getCurrent());

    stars.forEach((btn) => {
      btn.addEventListener('click', () => {
        const base = Number(btn.getAttribute('data-star'));
        setCurrent(base);
      });
    });
    halfBtn?.addEventListener('click', () => {
      const current = Number(getCurrent() || 0);
      const base = Math.floor(current);
      if (base <= 0) return; // require selecting at least 1 star first
      if (base >= 5) return; // cannot exceed 5
      const hasHalf = Math.abs(current - base) >= 0.5 - 1e-6;
      setCurrent(base + (hasHalf ? 0 : 0.5));
    });
  });

  const albumScoreInput = form.querySelector('#vv-album-score');
  if (albumScoreInput) {
    albumScoreInput.addEventListener('input', () => {
      const value = albumScoreInput.value.trim();
      state.draft.album_score = value === '' ? '' : Number(value);
      persistDraft();
      setStatus(statusEl, 'Unsaved changes', 'pending');
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitVotes(form, statusEl);
  });

  // Lazy toggle switch in header
  container.querySelector('#vv-lazy-toggle')?.addEventListener('change', async (e) => {
    const enabled = e.currentTarget.checked;
    await updateSettings({ lazyVoteEnabled: enabled });
    state.settings.lazyVoteEnabled = enabled;
    // Re-render form to swap controls
    const modal = container.closest('#' + OVERLAY_ID);
    if (modal) {
      showOverlay({ reason: 'manual' });
    }
  });
}

function applyDraftToForm(form) {
  const songs = state.album?.songs || [];
  songs.forEach((song) => {
    const input = form.querySelector(`[data-song-input="${song.id}"]`);
    const stars = form.querySelector(`.vv-stars[data-stars-for="${song.id}"] .vv-stars-group`);
    const value = state.draft.song_scores[song.id];
    if (input) {
      input.value = value === undefined || value === null || value === '' ? '' : value;
    }
    if (stars) {
      updateStarsGroupUI(stars, value);
    }
  });

  const albumScoreInput = form.querySelector('#vv-album-score');
  const albumValue = state.draft.album_score;
  if (albumScoreInput) {
    albumScoreInput.value = albumValue === undefined || albumValue === null || albumValue === '' ? '' : albumValue;
  }
  const albumGroup = form.querySelector('.vv-stars[data-stars-for="album"] .vv-stars-group');
  if (albumGroup) updateStarsGroupUI(albumGroup, albumValue);
}

async function submitVotes(form, statusEl) {
  if (!state.album) {
    setStatus(statusEl, 'No current album is available.', 'error');
    return;
  }

  const payload = buildPayloadFromForm(form);
  if (payload.error) {
    setStatus(statusEl, payload.error, 'error');
    return;
  }

  const submitButton = form.querySelector('.vv-submit');
  submitButton.disabled = true;
  setStatus(statusEl, 'Saving your votes…', 'pending');

  const wasNotVoted = !Boolean(state.user?.has_voted);
  const response = await apiFetch('/api/votes', { method: 'POST', body: payload.value });
  if (!response.ok) {
    submitButton.disabled = false;
    if (response.status === 401) {
      setStatus(statusEl, 'Please log in to Vinyl Vote in another tab, then try again.', 'error');
      state.authRequired = true;
      updateFabState();
      return;
    }
    const message = typeof response.data === 'object' && response.data?.error
      ? response.data.error
      : 'Something went wrong while saving.';
    setStatus(statusEl, message, 'error');
    return;
  }

  const data = response.data;
  state.album = data.album;
  state.voteEnd = data.vote_end;
  state.user = data.user;
  state.authRequired = false;
  await hydrateDraft();
  applyDraftToForm(form);
  clearDraftStorage();
  updateFabState();

  submitButton.disabled = false;
  setStatus(statusEl, 'Votes saved! Feel free to adjust them anytime.', 'success');

  // If the user just completed voting this week, offer to go vote for next week's album
  const nowVoted = Boolean(state.user?.has_voted);
  if (wasNotVoted && nowVoted) {
    // Small delay so the success message is visible
    setTimeout(() => {
      const go = window.confirm('Nice! Want to pick next week\'s album now?');
      if (go) openNextVotePage();
    }, 200);
  }
}

function buildPayloadFromForm(form) {
  const songScores = {};
  let albumScoreValue = null;

  const lazy = Boolean(state.settings?.lazyVoteEnabled);
  if (lazy) {
    // Use draft values set by stars
    const songs = state.album?.songs || [];
    for (const s of songs) {
      const v = state.draft.song_scores[s.id];
      if (v === undefined || v === null || v === '') return { error: 'Please score every track between 0 and 5.' };
      if (Number.isNaN(v) || v < 0 || v > 5) return { error: 'Scores must be between 0 and 5.' };
      songScores[String(s.id)] = Number(v);
    }
  } else {
    const songInputs = form.querySelectorAll('[data-song-input]');
    for (const input of songInputs) {
      const raw = input.value.trim();
      if (raw === '') {
        return { error: 'Please score every track between 0 and 5.' };
      }
      const value = Number(raw);
      if (Number.isNaN(value) || value < 0 || value > 5) {
        return { error: 'Scores must be between 0 and 5.' };
      }
      songScores[String(input.getAttribute('data-song-input'))] = value;
    }
  }

  if (lazy) {
    const v = state.draft.album_score;
    if (v === undefined || v === null || v === '') return { error: 'Please set an overall album score between 0 and 5.' };
    if (Number.isNaN(v) || v < 0 || v > 5) return { error: 'Overall album score must be between 0 and 5.' };
    albumScoreValue = Number(v);
  } else {
    const albumScoreInput = form.querySelector('#vv-album-score');
    const albumRaw = albumScoreInput.value.trim();
    if (albumRaw === '') {
      return { error: 'Please set an overall album score between 0 and 5.' };
    }
    const albumValue = Number(albumRaw);
    if (Number.isNaN(albumValue) || albumValue < 0 || albumValue > 5) {
      return { error: 'Overall album score must be between 0 and 5.' };
    }
    albumScoreValue = albumValue;
  }

  return { value: { song_scores: songScores, album_score: albumScoreValue } };
}

function setStatus(statusEl, message, stateClass) {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.className = `vv-status ${stateClass}`;
}

function startCountdown(element) {
  if (!element || !state.voteEnd) {
    return;
  }
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
  }

  const target = new Date(state.voteEnd).getTime();
  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      element.textContent = 'Voting closed';
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    element.textContent = `${days}d ${hours}h ${mins}m ${secs}s`;
  }

  tick();
  state.countdownTimer = setInterval(tick, 1000);
}

function getPlatformUrl() {
  if (!state.album || !state.platform) {
    return null;
  }
  const key = state.platform.key;
  return state.album[key] || null;
}

function openPlatformLink() {
  const url = getPlatformUrl();
  if (!url) {
    return;
  }
  window.open(url, '_blank', 'noopener');
}

function openVinylSite() {
  const origin = state.settings?.apiOrigin || DEFAULT_SETTINGS.apiOrigin;
  window.open(origin, '_blank', 'noopener');
}

function openNextVotePage() {
  const origin = state.settings?.apiOrigin || DEFAULT_SETTINGS.apiOrigin;
  const url = (origin || '').replace(/\/+$/, '') + '/next_album_vote';
  window.open(url, '_blank', 'noopener');
}

async function showRetroList() {
  const modal = document.querySelector('#' + OVERLAY_ID + ' .vv-modal');
  if (!modal) return;
  const res = await apiFetch('/api/retro-albums');
  const albums = res?.ok ? (res.data?.albums || []) : [];
  const items = albums.map(a => `
    <li>
      <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;background:rgba(15,23,42,0.04);padding:10px 12px;border-radius:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${encodeURI(a.cover_url || '')}" alt="${escapeHtml(a.title)} cover" style="width:48px;height:48px;border-radius:8px;object-fit:cover;" />
          <div>
            <div style="font-weight:700;">${escapeHtml(a.title)}</div>
            <div style="color:#475569;">${escapeHtml(a.artist)}</div>
          </div>
        </div>
        <button class="vv-btn" data-action="open-retro-album" data-retro-id="${a.id}">Open</button>
      </div>
    </li>
  `).join('');
  modal.innerHTML = `
    <div class="vv-panel">
      <button type="button" class="vv-close" aria-label="Close Vinyl Vote reminder">&times;</button>
      <h2 id="vinyl-vote-title">Retro albums</h2>
      <p class="vv-intro">Vote retroactively on past albums you've missed. Unlocked after completing this week's votes.</p>
      <div class="vv-actions">
        <button class="vv-btn" data-action="back-to-current">Back to current</button>
        <button class="vv-btn" data-action="open-vinyl">Open Vinyl Vote</button>
      </div>
      <ul style="display:flex;flex-direction:column;gap:10px;list-style:none;padding:0;margin:0;">
        ${items || '<li>No retro albums available. Nice work keeping up!</li>'}
      </ul>
    </div>
  `;
  modal.querySelector('.vv-close')?.addEventListener('click', closeOverlay);
  modal.querySelector('[data-action="back-to-current"]')?.addEventListener('click', () => {
    showOverlay({ reason: 'manual' });
  });
  modal.querySelectorAll('[data-action="open-retro-album"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-retro-id'));
      await showRetroAlbum(id);
    });
  });
  modal.querySelectorAll('[data-action="open-vinyl"]').forEach((button) => {
    button.addEventListener('click', (event) => { event.preventDefault(); openVinylSite(); });
  });
}

async function showRetroAlbum(albumId) {
  const modal = document.querySelector('#' + OVERLAY_ID + ' .vv-modal');
  if (!modal) return;
  const res = await apiFetch(`/api/retro-album/${albumId}`);
  if (!res?.ok) {
    modal.innerHTML = `<div class="vv-panel"><button type="button" class="vv-close" aria-label="Close">&times;</button><p class="vv-intro">This album is not eligible for retro voting.</p><div class="vv-actions"><button class="vv-btn" data-action="back-to-retro">Back</button></div></div>`;
    modal.querySelector('.vv-close')?.addEventListener('click', closeOverlay);
    modal.querySelector('[data-action="back-to-retro"]')?.addEventListener('click', showRetroList);
    return;
  }
  const { album } = res.data || {};
  const songs = album?.songs || [];
  const step = Number(state.settings?.lazyVoteStep || 0.5);
  const rows = songs.map((song) => {
    const prefix = song.track_number ? `${song.track_number}. ` : '';
    return `
      <label class="vv-song" data-song="${song.id}">
        <span>${prefix}${escapeHtml(song.title)}</span>
        <div class="vv-stars" data-stars-for="${song.id}">${renderStarInputs(step)}</div>
      </label>
    `;
  }).join('');
  modal.innerHTML = `
    <div class="vv-panel">
      <button type="button" class="vv-close" aria-label="Close Vinyl Vote reminder">&times;</button>
      <header class="vv-header">
        <img class="vv-cover" src="${encodeURI(album.cover_url || '')}" alt="${escapeHtml(album.title)} cover art" />
        <div class="vv-header-meta">
          <h2 id="vinyl-vote-title">Retro: ${escapeHtml(album.title)}</h2>
          <p class="vv-artist">${escapeHtml(album.artist)}</p>
        </div>
      </header>
      <form id="vinyl-retro-form">
        <div class="vv-song-list">${rows}</div>
        <label class="vv-album-score">
          <span>Your overall album score (0 – 5)</span>
          <div class="vv-stars" data-stars-for="album">${renderStarInputs(step)}</div>
        </label>
        <p class="vv-note">Retro votes are permanent for past albums.</p>
        <div class="vv-status" role="status"></div>
        <div class="vv-form-actions">
          <button type="button" class="vv-btn" data-action="back-to-retro">Back</button>
          <button type="submit" class="vv-submit">Submit retro votes</button>
        </div>
      </form>
    </div>
  `;
  modal.querySelector('.vv-close')?.addEventListener('click', closeOverlay);
  modal.querySelector('[data-action="back-to-retro"]')?.addEventListener('click', showRetroList);

  const draft = { song_scores: {}, album_score: '' };
  const form = modal.querySelector('#vinyl-retro-form');
  form.querySelectorAll('.vv-stars').forEach((wrap) => {
    const forId = wrap?.getAttribute('data-stars-for');
    const group = wrap.querySelector('.vv-stars-group');
    if (!group) return;
    updateStarsGroupUI(group, 0);
    group.querySelectorAll('.vv-star').forEach((btn) => {
      btn.addEventListener('click', () => {
        const base = Number(btn.getAttribute('data-star'));
        if (forId === 'album') {
          draft.album_score = base;
        } else {
          draft.song_scores[Number(forId)] = base;
        }
        updateStarsGroupUI(group, base);
      });
    });
    group.querySelector('.vv-half')?.addEventListener('click', () => {
      const current = forId === 'album' ? Number(draft.album_score || 0) : Number(draft.song_scores[Number(forId)] || 0);
      const base = Math.floor(current) || 1;
      if (base >= 5) return;
      const hasHalf = Math.abs(current - base) >= 0.5 - 1e-6;
      const val = base + (hasHalf ? 0 : 0.5);
      if (forId === 'album') draft.album_score = val; else draft.song_scores[Number(forId)] = val;
      updateStarsGroupUI(group, val);
    });
  });

  const statusEl = form.querySelector('.vv-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const s of songs) {
      const v = draft.song_scores[s.id];
      if (v === undefined || v === null || v === '') {
        setStatus(statusEl, 'Please score every track between 0 and 5.', 'error');
        return;
      }
    }
    if (draft.album_score === '' || draft.album_score === undefined || draft.album_score === null) {
      setStatus(statusEl, 'Please set an overall album score between 0 and 5.', 'error');
      return;
    }
    setStatus(statusEl, 'Submitting retro votes…', 'pending');
    const resp = await apiFetch(`/api/retro-votes/${albumId}`, { method: 'POST', body: { song_scores: draft.song_scores, album_score: draft.album_score } });
    if (!resp?.ok) {
      const message = typeof resp.data === 'object' && resp.data?.error ? resp.data.error : 'Something went wrong while saving.';
      setStatus(statusEl, message, 'error');
      return;
    }
    setStatus(statusEl, 'Retro votes submitted. Nice catch-up!', 'success');
    setTimeout(showRetroList, 700);
  });
}

function injectFab() {
  if (!document.body || document.getElementById(FAB_ID)) {
    return;
  }
  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.type = 'button';
  fab.textContent = 'Vinyl Vote';
  // Click handler can be temporarily ignored after a drag
  fab.addEventListener('click', (e) => {
    if (fab.__ignoreNextClick) {
      e.preventDefault();
      e.stopPropagation();
      fab.__ignoreNextClick = false;
      return;
    }
    showOverlay({ reason: 'manual' });
  });
  document.body.appendChild(fab);
  enableFabDragging(fab);
  restoreFabPosition(fab);
  updateFabState();
}

function updateFabState() {
  const fab = document.getElementById(FAB_ID);
  if (!fab) {
    return;
  }
  fab.classList.remove('vv-fab--alert', 'vv-fab--ok', 'vv-fab--auth');
  if (state.authRequired) {
    fab.classList.add('vv-fab--auth');
    return;
  }
  if (state.user?.has_voted) {
    fab.classList.add('vv-fab--ok');
  } else {
    fab.classList.add('vv-fab--alert');
  }
}

// ----- FAB dragging & persistence -----
function fabPositionStorageKey() {
  try {
    return `vinylVote:fabPos:${window.location.hostname}`;
  } catch (_) {
    return 'vinylVote:fabPos';
  }
}

function restoreFabPosition(fab) {
  const key = fabPositionStorageKey();
  chrome.storage.sync.get(key, (result) => {
    const pos = result[key];
    if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') {
      return;
    }
    applyFabPosition(fab, pos);
  });
  // Ensure on resize the button stays in view
  window.addEventListener('resize', () => clampFabIntoView(fab));
}

function saveFabPosition(fab) {
  const rect = fab.getBoundingClientRect();
  const pos = { left: rect.left, top: rect.top };
  const key = fabPositionStorageKey();
  chrome.storage.sync.set({ [key]: pos });
}

function applyFabPosition(fab, pos) {
  fab.style.left = `${Math.max(8, Math.round(pos.left))}px`;
  fab.style.top = `${Math.max(8, Math.round(pos.top))}px`;
  fab.style.right = 'auto';
  fab.style.bottom = 'auto';
  clampFabIntoView(fab);
}

function clampFabIntoView(fab) {
  const margin = 8;
  const rect = fab.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  const maxLeft = Math.max(0, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(0, window.innerHeight - rect.height - margin);
  left = Math.min(Math.max(margin, left), maxLeft);
  top = Math.min(Math.max(margin, top), maxTop);
  fab.style.left = `${left}px`;
  fab.style.top = `${top}px`;
  fab.style.right = 'auto';
  fab.style.bottom = 'auto';
}

function enableFabDragging(fab) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;

  function onPointerDown(e) {
    // Only primary button / touch
    if (e.button !== undefined && e.button !== 0) return;
    const rect = fab.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;
    dragging = true;
    moved = false;
    fab.classList.add('vv-dragging');
    fab.setPointerCapture?.(e.pointerId || 1);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      moved = true;
    }
    const margin = 8;
    const width = fab.offsetWidth;
    const height = fab.offsetHeight;
    let left = e.clientX - offsetX;
    let top = e.clientY - offsetY;
    const maxLeft = Math.max(0, window.innerWidth - width - margin);
    const maxTop = Math.max(0, window.innerHeight - height - margin);
    left = Math.min(Math.max(margin, left), maxLeft);
    top = Math.min(Math.max(margin, top), maxTop);
    fab.style.left = `${left}px`;
    fab.style.top = `${top}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    fab.classList.remove('vv-dragging');
    fab.releasePointerCapture?.(e.pointerId || 1);
    if (moved) {
      // Persist position and ignore the next click event
      saveFabPosition(fab);
      fab.__ignoreNextClick = true;
      setTimeout(() => (fab.__ignoreNextClick = false), 200);
    }
  }

  fab.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ----- Now playing detection & song prompt (YouTube Music focus) -----

function startNowPlayingWatcher() {
  if (!state.platform) return;
  // Polling keeps it resilient to SPA updates.
  setInterval(checkNowPlayingAndPrompt, 3000);
}

async function checkNowPlayingAndPrompt() {
  if (!state.album || state.authRequired) {
    return;
  }

  const now = getNowPlaying();
  if (!now || !now.title) {
    return;
  }

  const changed = now.title !== state.nowPlaying.title || now.artist !== state.nowPlaying.artist;
  state.nowPlaying = now;
  if (!changed) return;

  // Track changed: if we had a matched song previously, prompt for it now
  if (state.currentMatchedSong && state.settings?.afterSongPrompt) {
    const prev = state.currentMatchedSong;
    const already = state.draft.song_scores[prev.id];
    if (already === undefined || already === null || already === '') {
      const cooldownMin = Number(state.settings?.songPromptCooldownMinutes || 60);
      const cooldownMs = Math.max(5, cooldownMin) * 60 * 1000;
      const last = await getLastSongPrompt(state.album.id, prev.id);
      if (!last || Date.now() - last >= cooldownMs) {
        chrome.runtime.sendMessage({ type: 'vinylVote:songCompleted', song: { id: prev.id, title: prev.title } });
      }
    }
  }

  // Find match for the new track and remember it as current
  // Respect platform toggles
  if (!platformEnabledForHost()) return;

  const match = matchSongToAlbum(now.title, now.artist);
  state.currentMatchedSong = match || null;
  if (!match) {
    hideSongPrompt();
    return;
  }
}
function platformEnabledForHost() {
  const host = window.location.hostname;
  const p = state.settings?.platforms || DEFAULT_SETTINGS.platforms;
  if (host === 'music.youtube.com') return Boolean(p.ytmusic);
  if (host === 'open.spotify.com') return Boolean(p.spotify);
  if (host === 'music.apple.com') return Boolean(p.apple);
  return true;
}

function getNowPlaying() {
  const host = window.location.hostname;
  try {
    if (host === 'music.youtube.com') {
      const bar = document.querySelector('ytmusic-player-bar');
      const titleEl = bar?.querySelector('.title');
      const artistEl = bar?.querySelector('.byline');
      const title = (titleEl?.textContent || '').trim();
      const artist = (artistEl?.textContent || '').trim();
      if (title) return { title, artist };
    }
    if (host === 'open.spotify.com') {
      const title = (document.querySelector('[data-testid="nowplaying-track-link"]')?.textContent ||
        document.querySelector('[data-testid="context-item-info-title"]')?.textContent || '').trim();
      const artist = (document.querySelector('[data-testid="nowplaying-artist"]')?.textContent ||
        document.querySelector('[data-testid="context-item-info-subtitles"]')?.textContent || '').trim();
      if (title) return { title, artist };
    }
    if (host === 'music.apple.com') {
      const title = (document.querySelector('[data-testid="web-player__song__song-name"]')?.textContent ||
        document.querySelector('.web-chrome-playback-lcd__song-name-scroll-inner-text-wrapper span')?.textContent || '').trim();
      const artist = (document.querySelector('[data-testid="web-player__song__sub-copy"]')?.textContent ||
        document.querySelector('.web-chrome-playback-lcd__sub-copy-scroll-inner-text-wrapper span')?.textContent || '').trim();
      if (title) return { title, artist };
    }
  } catch (_) {}
  // Fallback to document.title pattern
  const t = document.title || '';
  if (t) {
    const cleaned = t.replace(/\s*[|\-–].*$/, '').trim();
    if (cleaned) return { title: cleaned, artist: '' };
  }
  return null;
}

// Receive prompt requests from background (after-song cross-tab reminders)
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'vinylVote:promptForSong' && message.song) {
    const { song } = message;
    // Ensure still same album and not rated
    if (!state.album) return;
    const already = state.draft.song_scores[song.id];
    if (already !== undefined && already !== null && already !== '') return;
    showSongPrompt(song);
    setLastSongPrompt(state.album.id, song.id);
  }
});

function normalizeTrackName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s*\([^\)]*\)/g, ' ') // remove (feat...), (official video), etc
    .replace(/\s*\[[^\]]*\]/g, ' ') // remove [live], etc
    .replace(/feat\.|ft\.|official video|remaster(?:ed)?\s*\d{0,4}/g, ' ')
    .replace(/[\u2013\u2014\-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSongToAlbum(title, artist) {
  if (!state.album?.songs?.length) return null;
  const t = normalizeTrackName(title);
  const a = normalizeTrackName(artist || state.album.artist || '');
  let best = null;
  let bestScore = 0;
  for (const song of state.album.songs) {
    const st = normalizeTrackName(song.title);
    let score = 0;
    if (st === t) score += 2; // exact normalized title match
    if (t && st && (st.includes(t) || t.includes(st))) score += 1;
    if (a && normalizeTrackName(state.album.artist).includes(a)) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = song;
    }
  }
  return bestScore >= 2 ? best : null; // require a reasonable match
}

function getLastSongPrompt(albumId, songId) {
  const key = `vinylVote:lastSongPrompt:${albumId}:${songId}`;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (r) => resolve(r[key] || null));
  });
}

function setLastSongPrompt(albumId, songId) {
  const key = `vinylVote:lastSongPrompt:${albumId}:${songId}`;
  chrome.storage.local.set({ [key]: Date.now() });
}

function showSongPrompt(song) {
  hideSongPrompt();
  const container = document.createElement('div');
  container.id = SONG_PROMPT_ID;
  container.setAttribute('role', 'dialog');
  const lazy = Boolean(state.settings?.lazyVoteEnabled);
  const step = Number(state.settings?.lazyVoteStep || 0.5);
  const starInputs = lazy ? renderStarInputs(step) : '';
  container.innerHTML = `
    <div class="vv-sp-body">
      <div class="vv-sp-text">
        <strong>How was it?</strong>
        <div>${escapeHtml(song.title)}</div>
      </div>
      ${lazy ? `<div class="vv-sp-stars" role="group" aria-label="Rate ${escapeHtml(song.title)}">${starInputs}</div>` : `<input type="number" min="0" max="5" step="0.1" inputmode="decimal" class="vv-sp-input" aria-label="Your score for ${escapeHtml(song.title)}" />`}
      <div class="vv-sp-actions">
        <button class="vv-sp-save">Save</button>
        <button class="vv-sp-dismiss" aria-label="Dismiss">✕</button>
      </div>
    </div>`;
  document.body.appendChild(container);

  const input = container.querySelector('.vv-sp-input');
  const saveBtn = container.querySelector('.vv-sp-save');
  const dismissBtn = container.querySelector('.vv-sp-dismiss');

  input?.focus();

  if (lazy) {
    const group = container.querySelector('.vv-stars-group');
    updateStarsGroupUI(group, state.draft.song_scores[song.id]);
    const setVal = (v) => {
      state.draft.song_scores[song.id] = Math.max(0, Math.min(5, Number(v)));
      persistDraft();
      hideSongPrompt();
      openOverlayIfLastTrack(song.id);
    };
    group.querySelectorAll('.vv-star').forEach((btn) => {
      btn.addEventListener('click', () => {
        const base = Number(btn.getAttribute('data-star'));
        setVal(base);
      });
    });
    group.querySelector('.vv-half')?.addEventListener('click', () => {
      const current = Number(state.draft.song_scores[song.id] || 0);
      const base = Math.floor(current) || 1; // ensure at least 1
      if (base >= 5) return;
      const hasHalf = Math.abs(current - base) >= 0.5 - 1e-6;
      setVal(base + (hasHalf ? 0 : 0.5));
    });
  }

  function save() {
    if (!input) {
      hideSongPrompt();
      return;
    }
    const raw = input.value.trim();
    if (raw === '') {
      hideSongPrompt();
      return;
    }
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0 || value > 5) {
      input.classList.add('vv-sp-error');
      return;
    }
    state.draft.song_scores[song.id] = value;
    persistDraft();
    hideSongPrompt();
    openOverlayIfLastTrack(song.id);
  }

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      save();
    } else if (e.key === 'Escape') {
      hideSongPrompt();
    }
  });
  saveBtn?.addEventListener('click', save);
  dismissBtn.addEventListener('click', hideSongPrompt);
}

function hideSongPrompt() {
  document.getElementById(SONG_PROMPT_ID)?.remove();
}

// --- Last-track helpers & UX ---
function getSortedSongs() {
  try {
    const songs = Array.isArray(state.album?.songs) ? state.album.songs.slice() : [];
    return songs.sort((a, b) => (a.track_number || 0) - (b.track_number || 0));
  } catch (_) {
    return [];
  }
}

function isLastTrack(songId) {
  const songs = getSortedSongs();
  if (!songs.length) return false;
  const idx = songs.findIndex((s) => s.id === songId);
  return idx >= 0 && idx === songs.length - 1;
}

function openOverlayIfLastTrack(songId) {
  if (!songId) return;
  // Only nudge if the user hasn't actually submitted votes yet
  const notSubmitted = !Boolean(state.user?.has_voted);
  if (isLastTrack(songId) && notSubmitted) {
    // If overlay is already open, keep it; otherwise open to album score/submit
    if (!state.overlay) {
      showOverlay({ reason: 'auto' });
      // Focus album score control to guide user to finish and submit
      setTimeout(() => {
        const modal = document.querySelector('#' + OVERLAY_ID);
        if (!modal) return;
        const input = modal.querySelector('#vv-album-score');
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const albumStars = modal.querySelector('.vv-stars[data-stars-for="album"]');
        if (albumStars) {
          albumStars.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  }
}

function renderStarInputs(step) {
  return `
    <div class="vv-stars-group" data-step="${step}" role="group" aria-label="Star rating selector">
      <button type="button" class="vv-star" data-star="1" aria-label="1 star">★</button>
      <button type="button" class="vv-star" data-star="2" aria-label="2 stars">★</button>
      <button type="button" class="vv-star" data-star="3" aria-label="3 stars">★</button>
      <button type="button" class="vv-star" data-star="4" aria-label="4 stars">★</button>
      <button type="button" class="vv-star" data-star="5" aria-label="5 stars">★</button>
      <button type="button" class="vv-half" aria-label="Toggle half star">½</button>
    </div>
  `;
}

function updateStarsGroupUI(group, value) {
  const v = Number(value || 0);
  const base = Math.floor(v);
  const half = Math.abs(v - base) >= 0.5 - 1e-6 && base < 5;
  const stars = group.querySelectorAll('.vv-star');
  stars.forEach((btn) => {
    const n = Number(btn.getAttribute('data-star'));
    btn.classList.toggle('active', n <= base);
  });
  const halfBtn = group.querySelector('.vv-half');
  if (halfBtn) {
    halfBtn.classList.toggle('active', half);
    halfBtn.disabled = base <= 0 || base >= 5;
  }
}