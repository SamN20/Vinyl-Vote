import { useCallback, useEffect, useState } from "react";
import {
  deleteAlbumComment,
  flagAlbumComment,
  getAlbumComments,
  postAlbumComment,
} from "../api";

export function useAlbumComments(albumId) {
  const [comments, setComments] = useState([]);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [submitState, setSubmitState] = useState("idle");

  const loadComments = useCallback(async () => {
    if (!albumId) {
      setComments([]);
      setState("idle");
      return;
    }

    setState("loading");
    setError("");

    try {
      const data = await getAlbumComments(albumId);
      setComments(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (loadError) {
      setState("error");
      setError(loadError.message || "Failed to load comments.");
    }
  }, [albumId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const submitComment = useCallback(async (text, parentId = null) => {
    if (!albumId) {
      return;
    }

    setSubmitState("saving");
    setError("");

    try {
      await postAlbumComment(albumId, text, parentId);
      setSubmitState("saved");
      await loadComments();
    } catch (saveError) {
      setSubmitState("error");
      setError(saveError.message || "Failed to post comment.");
    }
  }, [albumId, loadComments]);

  const removeComment = useCallback(async (commentId) => {
    setError("");
    try {
      await deleteAlbumComment(commentId);
      await loadComments();
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete comment.");
    }
  }, [loadComments]);

  const flagComment = useCallback(async (commentId) => {
    setError("");
    try {
      await flagAlbumComment(commentId);
      await loadComments();
    } catch (flagError) {
      setError(flagError.message || "Failed to flag comment.");
    }
  }, [loadComments]);

  return {
    comments,
    error,
    flagComment,
    loadComments,
    removeComment,
    state,
    submitComment,
    submitState,
  };
}
