import { useCallback, useEffect, useMemo, useState } from "react";
import { getNextAlbumVoteOptions, submitNextAlbumVote } from "../api";

export function useNextAlbumVoteFlow(isEnabled) {
  const [albums, setAlbums] = useState([]);
  const [currentAlbum, setCurrentAlbum] = useState(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState("");
  const [state, setState] = useState("idle");
  const [submitState, setSubmitState] = useState("idle");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const selectedAlbum = useMemo(
    () => albums.find((album) => String(album.id) === String(selectedAlbumId)) || null,
    [albums, selectedAlbumId]
  );

  const loadOptions = useCallback(async () => {
    if (!isEnabled) {
      setAlbums([]);
      setCurrentAlbum(null);
      setSelectedAlbumId("");
      setState("idle");
      return;
    }

    setState("loading");
    setError("");

    try {
      const payload = await getNextAlbumVoteOptions();
      const nextAlbums = payload?.albums || [];
      setAlbums(nextAlbums);
      setCurrentAlbum(payload?.current_album || null);
      setSelectedAlbumId(payload?.selected_album_id ? String(payload.selected_album_id) : "");
      setState("ready");
    } catch (loadError) {
      setState("error");
      setError(loadError.message || "Failed to load next-week album choices.");
    }
  }, [isEnabled]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const saveChoice = useCallback(async () => {
    if (!selectedAlbumId) {
      setError("Choose an album before submitting.");
      return null;
    }

    setSubmitState("saving");
    setError("");
    setFeedback("");

    try {
      const payload = await submitNextAlbumVote(selectedAlbumId);
      const nextAlbums = payload?.albums || [];
      setAlbums(nextAlbums);
      setCurrentAlbum(payload?.current_album || null);
      setSelectedAlbumId(payload?.selected_album_id ? String(payload.selected_album_id) : "");
      setFeedback(payload?.message || "Your choice for next week has been recorded.");
      setSubmitState("saved");
      return payload;
    } catch (saveError) {
      setSubmitState("error");
      setError(saveError.message || "Failed to save your next-week pick.");
      return null;
    }
  }, [selectedAlbumId]);

  return {
    albums,
    currentAlbum,
    error,
    feedback,
    loadOptions,
    saveChoice,
    selectedAlbum,
    selectedAlbumId,
    setSelectedAlbumId,
    state,
    submitState,
  };
}
