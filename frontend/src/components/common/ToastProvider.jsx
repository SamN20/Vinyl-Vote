import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToToasts } from "../../utils/toastBus";
import "./ToastProvider.css";

const ToastContext = createContext({
  addToast: () => {},
});

const DEFAULT_DURATION_BY_VARIANT = {
  success: 4000,
  info: 4000,
  error: 0,
};

function resolveDuration(detail) {
  if (typeof detail.duration === "number") {
    return Math.max(0, detail.duration);
  }
  return DEFAULT_DURATION_BY_VARIANT[detail.variant] ?? 4000;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutMapRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));

    const timeoutId = timeoutMapRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutMapRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (detail = {}) => {
      if (!detail.message) {
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const nextToast = {
        id,
        message: detail.message,
        title: detail.title || "",
        variant: detail.variant || "info",
        duration: resolveDuration(detail),
      };

      setToasts((previous) => {
        const updated = [...previous, nextToast];
        if (updated.length <= 3) {
          return updated;
        }

        const [oldest] = updated;
        if (oldest?.id) {
          const timeoutId = timeoutMapRef.current.get(oldest.id);
          if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutMapRef.current.delete(oldest.id);
          }
        }
        return updated.slice(-3);
      });

      if (nextToast.duration > 0) {
        const timeoutId = window.setTimeout(() => {
          removeToast(id);
        }, nextToast.duration);
        timeoutMapRef.current.set(id, timeoutId);
      }
    },
    [removeToast]
  );

  useEffect(() => {
    const unsubscribe = subscribeToToasts((detail) => {
      addToast(detail);
    });

    return () => {
      unsubscribe();
      timeoutMapRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeoutMapRef.current.clear();
    };
  }, [addToast]);

  const value = useMemo(
    () => ({
      addToast,
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => (
          <article key={toast.id} className={`toast toast-${toast.variant}`}>
            <div className="toast-content">
              {toast.title ? <p className="toast-title">{toast.title}</p> : null}
              <p className="toast-message">{toast.message}</p>
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => removeToast(toast.id)}
            >
              x
            </button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
