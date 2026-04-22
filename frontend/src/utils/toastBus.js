const TOAST_EVENT_NAME = "vinylvote:toast";

export function pushToast(detail) {
  if (typeof window === "undefined") {
    return;
  }

  const message = detail?.message;
  if (!message) {
    return;
  }

  window.dispatchEvent(new CustomEvent(TOAST_EVENT_NAME, { detail }));
}

export function subscribeToToasts(handler) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener = (event) => {
    handler(event.detail || {});
  };

  window.addEventListener(TOAST_EVENT_NAME, listener);
  return () => {
    window.removeEventListener(TOAST_EVENT_NAME, listener);
  };
}
