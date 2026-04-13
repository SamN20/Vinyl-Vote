import { useCallback, useEffect, useState } from "react";
import { getLatestResults, getResultsForAlbum } from "../api";

export function useResultsFlow(routeAlbumId) {
  const [resultsPayload, setResultsPayload] = useState(null);
  const [resultsState, setResultsState] = useState("loading");
  const [error, setError] = useState("");

  const loadResults = useCallback(async () => {
    setResultsState("loading");
    setError("");

    try {
      const payload = routeAlbumId ? await getResultsForAlbum(routeAlbumId) : await getLatestResults();
      setResultsPayload(payload);
      setResultsState("ready");
    } catch (loadError) {
      setResultsPayload(null);
      if (loadError.status === 404) {
        setResultsState("empty");
      } else {
        setResultsState("error");
      }
      setError(loadError.message || "Failed to load results.");
    }
  }, [routeAlbumId]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  return {
    resultsPayload,
    resultsState,
    error,
    loadResults,
  };
}
