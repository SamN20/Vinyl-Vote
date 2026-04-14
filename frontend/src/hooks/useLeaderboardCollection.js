import { useCallback, useEffect, useMemo, useState } from "react";

function parseInitialQuery(routePath, defaults) {
  const hash = (window.location.hash || "").replace(/^#/, "").trim();
  if (!hash) {
    return { ...defaults };
  }

  const [pathPart, queryPart = ""] = hash.split("?");
  if (pathPart !== routePath) {
    return { ...defaults };
  }

  const params = new URLSearchParams(queryPart);
  const next = { ...defaults };

  Object.keys(defaults).forEach((key) => {
    const value = params.get(key);
    if (value === null) {
      return;
    }

    if (typeof defaults[key] === "number") {
      const numeric = Number(value);
      next[key] = Number.isNaN(numeric) ? defaults[key] : numeric;
    } else {
      next[key] = value;
    }
  });

  return next;
}

function syncHash(routePath, query, defaults) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    if (defaults[key] === value) {
      return;
    }
    params.set(key, String(value));
  });

  const suffix = params.toString();
  const nextHash = suffix ? `#${routePath}?${suffix}` : `#${routePath}`;
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
  window.history.replaceState(null, "", nextUrl);
}

export function useLeaderboardCollection({ routePath, fetcher, defaults }) {
  const [query, setQuery] = useState(() => parseInitialQuery(routePath, defaults));
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);

  const requestPayload = useMemo(() => ({ ...query }), [query]);

  const load = useCallback(async () => {
    setState("loading");
    setError("");

    try {
      const payload = await fetcher(requestPayload);
      setItems(payload.items || []);
      setPagination(payload.pagination || null);
      setState((payload.items || []).length ? "ready" : "empty");
    } catch (loadError) {
      setItems([]);
      setPagination(null);
      setState("error");
      setError(loadError.message || "Failed to load leaderboard.");
    }
  }, [fetcher, requestPayload]);

  useEffect(() => {
    syncHash(routePath, query, defaults);
  }, [defaults, query, routePath]);

  useEffect(() => {
    load();
  }, [load]);

  const updateQuery = useCallback((patch, options = {}) => {
    const resetPage = options.resetPage === true;
    setQuery((prev) => ({
      ...prev,
      ...patch,
      page: resetPage ? 1 : (patch.page ?? prev.page),
    }));
  }, []);

  const setPage = useCallback((page) => {
    setQuery((prev) => ({ ...prev, page }));
  }, []);

  const resetQuery = useCallback(() => {
    setQuery({ ...defaults });
  }, [defaults]);

  const toggleSort = useCallback((sortKey, defaultDirection = "desc") => {
    setQuery((prev) => {
      if (prev.sort_by === sortKey) {
        return {
          ...prev,
          sort_dir: prev.sort_dir === "asc" ? "desc" : "asc",
          page: 1,
        };
      }

      return {
        ...prev,
        sort_by: sortKey,
        sort_dir: defaultDirection,
        page: 1,
      };
    });
  }, []);

  return {
    query,
    state,
    error,
    items,
    pagination,
    updateQuery,
    setPage,
    resetQuery,
    toggleSort,
    reload: load,
  };
}
