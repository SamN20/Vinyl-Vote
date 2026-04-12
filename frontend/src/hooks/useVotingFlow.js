import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentAlbum, sessionCheck, submitVotes } from "../api";

function readScore(song, songVotes) {
  const fromSong = song?.score;
  if (fromSong !== undefined && fromSong !== null && fromSong !== "") {
    return String(fromSong);
  }

  const fromMap = songVotes?.[String(song.id)];
  if (fromMap !== undefined && fromMap !== null && fromMap !== "") {
    return String(fromMap);
  }

  return "";
}

function parseScore(raw) {
  if (raw === "" || raw === undefined || raw === null) {
    return null;
  }
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

function sameScore(left, right) {
  const l = parseScore(left);
  const r = parseScore(right);
  return l === r;
}

export function formatVoteEnd(value) {
  if (!value) {
    return "No vote deadline is currently set.";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function useVotingFlow() {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [sessionState, setSessionState] = useState("loading");
  const [albumState, setAlbumState] = useState("idle");
  const [albumPayload, setAlbumPayload] = useState(null);
  const [songScores, setSongScores] = useState({});
  const [albumScore, setAlbumScore] = useState("");
  const [baselineSongScores, setBaselineSongScores] = useState({});
  const [baselineAlbumScore, setBaselineAlbumScore] = useState("");
  const [submitState, setSubmitState] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const songs = useMemo(() => albumPayload?.album?.songs || [], [albumPayload]);

  const applyAlbumPayload = useCallback((payload, { restoreDraft = true } = {}) => {
    setAlbumPayload(payload);

    const nextScores = {};
    const songVotes = payload?.user?.song_votes || {};
    for (const song of payload?.album?.songs || []) {
      nextScores[song.id] = readScore(song, songVotes);
    }

    const nextAlbumScore = payload?.user?.album_score;
    const normalizedAlbumScore =
      nextAlbumScore === null || nextAlbumScore === undefined ? "" : String(nextAlbumScore);

    let hydratedScores = nextScores;
    let hydratedAlbumScore = normalizedAlbumScore;

    const albumId = payload?.album?.id;
    if (restoreDraft && albumId) {
      try {
        const draftRaw = localStorage.getItem(`v2_vote_draft_${albumId}`);
        if (draftRaw) {
          const draft = JSON.parse(draftRaw);
          const draftScores = draft?.songScores || {};
          hydratedScores = { ...nextScores };
          for (const song of payload?.album?.songs || []) {
            const draftValue = draftScores[song.id];
            if (draftValue !== undefined && draftValue !== null) {
              hydratedScores[song.id] = String(draftValue);
            }
          }

          if (draft?.albumScore !== undefined && draft?.albumScore !== null) {
            hydratedAlbumScore = String(draft.albumScore);
          }
        }
      } catch {
        // Ignore malformed draft data and continue with server values.
      }
    }

    setSongScores(hydratedScores);
    setAlbumScore(hydratedAlbumScore);
    setBaselineSongScores(nextScores);
    setBaselineAlbumScore(normalizedAlbumScore);
  }, []);

  const loadAlbum = useCallback(async () => {
    setAlbumState("loading");
    setFeedback("");
    setError("");

    try {
      const payload = await getCurrentAlbum();
      applyAlbumPayload(payload, { restoreDraft: true });
      setAlbumState("ready");
    } catch (loadError) {
      if (loadError.status === 404) {
        setAlbumState("empty");
        setError(loadError.message || "No current album is available right now.");
      } else {
        setAlbumState("error");
        setError(loadError.message || "Failed to load the active album.");
      }
    }
  }, [applyAlbumPayload]);

  useEffect(() => {
    async function bootstrap() {
      setError("");
      try {
        const session = await sessionCheck();
        setSessionInfo(session);

        if (!session.authenticated) {
          setSessionState("anonymous");
          setAlbumState("idle");
          return;
        }

        setSessionState("authenticated");
        await loadAlbum();
      } catch (loadError) {
        setSessionState("error");
        setError(loadError.message || "Failed to validate session.");
      }
    }

    bootstrap();
  }, [loadAlbum]);

  const setSongScore = useCallback((songId, value) => {
    setSongScores((prev) => ({
      ...prev,
      [songId]: value,
    }));
  }, []);

  const buildVotePayload = useCallback(() => {
    const compactSongScores = {};

    for (const song of songs) {
      const raw = songScores[song.id];
      if (raw === undefined || raw === null || raw === "") {
        continue;
      }

      const numeric = Number(raw);
      if (Number.isNaN(numeric) || numeric < 0 || numeric > 5) {
        throw new Error(`Song \"${song.title}\" needs a score between 0 and 5.`);
      }
      compactSongScores[String(song.id)] = numeric;
    }

    const payload = { song_scores: compactSongScores };

    if (albumScore !== "") {
      const numericAlbumScore = Number(albumScore);
      if (Number.isNaN(numericAlbumScore) || numericAlbumScore < 0 || numericAlbumScore > 5) {
        throw new Error("Album score must be between 0 and 5.");
      }
      payload.album_score = numericAlbumScore;
    }

    return payload;
  }, [albumScore, songScores, songs]);

  const saveVotes = useCallback(async () => {
    setError("");
    setFeedback("");

    let payload;
    try {
      payload = buildVotePayload();
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setSubmitState("saving");

    try {
      const result = await submitVotes(payload);
      if (result?.album?.id) {
        localStorage.removeItem(`v2_vote_draft_${result.album.id}`);
      }
      applyAlbumPayload(result, { restoreDraft: false });
      setFeedback(result.message || "Votes saved.");
      setSubmitState("saved");
    } catch (saveError) {
      setSubmitState("error");
      setError(saveError.message || "Failed to save your votes.");
    }
  }, [applyAlbumPayload, buildVotePayload]);

  const hasUnsavedChanges = useMemo(() => {
    if (!songs.length) {
      return false;
    }

    for (const song of songs) {
      if (!sameScore(songScores[song.id], baselineSongScores[song.id])) {
        return true;
      }
    }

    return !sameScore(albumScore, baselineAlbumScore);
  }, [albumScore, baselineAlbumScore, baselineSongScores, songScores, songs]);

  const ratedTracks = useMemo(() => {
    let count = 0;
    for (const song of songs) {
      const score = parseScore(songScores[song.id]);
      if (score !== null && score > 0) {
        count += 1;
      }
    }
    return count;
  }, [songScores, songs]);

  const totalTracks = songs.length;
  const remainingTracks = Math.max(totalTracks - ratedTracks, 0);
  const progressPercent = totalTracks > 0 ? Math.round((ratedTracks / totalTracks) * 100) : 0;

  const hasSavedVotes = useMemo(() => {
    if (albumPayload?.user?.has_voted) {
      return true;
    }

    for (const song of songs) {
      const score = parseScore(baselineSongScores[song.id]);
      if (score !== null && score > 0) {
        return true;
      }
    }

    const baseAlbumScore = parseScore(baselineAlbumScore);
    return baseAlbumScore !== null && baseAlbumScore > 0;
  }, [albumPayload?.user?.has_voted, baselineAlbumScore, baselineSongScores, songs]);

  const statusLabel = hasUnsavedChanges
    ? "Unsubmitted changes"
    : hasSavedVotes
      ? "VOTED!"
      : "No votes submitted";

  useEffect(() => {
    const albumId = albumPayload?.album?.id;
    if (!albumId || albumState !== "ready") {
      return;
    }

    if (!hasUnsavedChanges) {
      localStorage.removeItem(`v2_vote_draft_${albumId}`);
      return;
    }

    const draft = {
      songScores,
      albumScore,
      savedAt: Date.now(),
    };

    localStorage.setItem(`v2_vote_draft_${albumId}`, JSON.stringify(draft));
  }, [albumPayload?.album?.id, albumScore, albumState, hasUnsavedChanges, songScores]);

  return {
    albumPayload,
    albumScore,
    albumState,
    error,
    feedback,
    hasSavedVotes,
    hasUnsavedChanges,
    saveVotes,
    statusLabel,
    progressPercent,
    ratedTracks,
    remainingTracks,
    sessionInfo,
    sessionState,
    setAlbumScore,
    setSongScore,
    songScores,
    songs,
    submitState,
    loadAlbum,
  };
}
