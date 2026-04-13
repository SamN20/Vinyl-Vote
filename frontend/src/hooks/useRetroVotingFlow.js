import { useCallback, useEffect, useMemo, useState } from "react";
import { getRetroAlbum, getRetroRecommendations, submitRetroVotes } from "../api";

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

export function useRetroVotingFlow(isEnabled) {
  const [albums, setAlbums] = useState([]);
  const [albumsState, setAlbumsState] = useState("idle");
  const [albumsError, setAlbumsError] = useState("");

  const [selectedAlbumId, setSelectedAlbumId] = useState("");
  const [albumPayload, setAlbumPayload] = useState(null);
  const [albumState, setAlbumState] = useState("idle");

  const [songScores, setSongScores] = useState({});
  const [albumScore, setAlbumScore] = useState("");
  const [baselineSongScores, setBaselineSongScores] = useState({});
  const [baselineAlbumScore, setBaselineAlbumScore] = useState("");

  const [submitState, setSubmitState] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const songs = useMemo(() => albumPayload?.album?.songs || [], [albumPayload]);

  const resetVoteForm = useCallback(() => {
    setSongScores({});
    setAlbumScore("");
    setBaselineSongScores({});
    setBaselineAlbumScore("");
    setFeedback("");
    setError("");
    setSubmitState("idle");
  }, []);

  const applyAlbumPayload = useCallback((payload) => {
    setAlbumPayload(payload);

    const nextScores = {};
    const songVotes = payload?.user?.song_votes || {};
    for (const song of payload?.album?.songs || []) {
      nextScores[song.id] = readScore(song, songVotes);
    }
    setSongScores(nextScores);
    setBaselineSongScores(nextScores);

    const nextAlbumScore = payload?.user?.album_score;
    const normalizedAlbumScore = nextAlbumScore === null || nextAlbumScore === undefined ? "" : String(nextAlbumScore);
    setAlbumScore(normalizedAlbumScore);
    setBaselineAlbumScore(normalizedAlbumScore);
  }, []);

  const loadAlbums = useCallback(async () => {
    if (!isEnabled) {
      setAlbums([]);
      setAlbumsState("idle");
      return;
    }

    setAlbumsState("loading");
    setAlbumsError("");

    try {
      const payload = await getRetroRecommendations();
      const nextAlbums = payload?.albums || [];
      setAlbums(nextAlbums);
      setAlbumsState("ready");

      if (!nextAlbums.length) {
        setSelectedAlbumId("");
        setAlbumPayload(null);
        setAlbumState("idle");
        resetVoteForm();
        return;
      }

      const stillValid = nextAlbums.some((album) => String(album.id) === String(selectedAlbumId));
      if (!stillValid) {
        setSelectedAlbumId("");
      }
    } catch (loadError) {
      setAlbumsState("error");
      setAlbumsError(loadError.message || "Failed to load retro albums.");
    }
  }, [isEnabled, resetVoteForm, selectedAlbumId]);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  const loadSelectedAlbum = useCallback(async () => {
    if (!isEnabled || !selectedAlbumId) {
      setAlbumPayload(null);
      setAlbumState("idle");
      resetVoteForm();
      return;
    }

    setAlbumState("loading");
    setError("");
    setFeedback("");

    try {
      const payload = await getRetroAlbum(selectedAlbumId);
      applyAlbumPayload(payload);
      setAlbumState("ready");
    } catch (loadError) {
      setAlbumState("error");
      setError(loadError.message || "Failed to load selected retro album.");
    }
  }, [applyAlbumPayload, isEnabled, resetVoteForm, selectedAlbumId]);

  useEffect(() => {
    loadSelectedAlbum();
  }, [loadSelectedAlbum]);

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
    if (!selectedAlbumId) {
      return;
    }

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
      const result = await submitRetroVotes(selectedAlbumId, payload);
      applyAlbumPayload(result);
      setFeedback(result.message || "Retro votes saved.");
      setSubmitState("saved");
      await loadAlbums();
    } catch (saveError) {
      setSubmitState("error");
      setError(saveError.message || "Failed to save retro votes.");
      await loadAlbums();
    }
  }, [applyAlbumPayload, buildVotePayload, loadAlbums, selectedAlbumId]);

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

  return {
    albumPayload,
    albumScore,
    albums,
    albumsError,
    albumsState,
    albumState,
    error,
    feedback,
    hasSavedVotes,
    hasUnsavedChanges,
    loadAlbums,
    progressPercent,
    ratedTracks,
    remainingTracks,
    saveVotes,
    selectedAlbumId,
    setAlbumScore,
    setSelectedAlbumId,
    setSongScore,
    songScores,
    songs,
    statusLabel,
    submitState,
  };
}
