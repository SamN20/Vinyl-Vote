import { useEffect, useMemo, useState } from "react";
import { getActiveNotifications } from "../../api";
import "./SiteNotifications.css";

const POPUP_DISMISS_PREFIX = "dismissed_popup_";

function isDismissedPopup(notificationId) {
  try {
    return window.localStorage.getItem(`${POPUP_DISMISS_PREFIX}${notificationId}`) === "true";
  } catch (error) {
    return false;
  }
}

function dismissPopup(notificationId) {
  try {
    window.localStorage.setItem(`${POPUP_DISMISS_PREFIX}${notificationId}`, "true");
  } catch (error) {
    // Ignore localStorage write issues in private browsing contexts.
  }
}

export default function SiteNotifications() {
  const [banner, setBanner] = useState(null);
  const [popups, setPopups] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const payload = await getActiveNotifications();
        if (cancelled) {
          return;
        }

        setBanner(payload?.banner || null);

        const visiblePopups = (payload?.popups || []).filter((notification) => !isDismissedPopup(notification.id));
        setPopups(visiblePopups);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setBanner(null);
        setPopups([]);
      }
    }

    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const topPopup = useMemo(() => {
    if (!popups.length) {
      return null;
    }
    return popups[0];
  }, [popups]);

  function handleDismissPopup(notificationId) {
    dismissPopup(notificationId);
    setPopups((previous) => previous.filter((popup) => popup.id !== notificationId));
  }

  return (
    <>
      {banner ? (
        <div className="site-banner-v2" role="status" aria-live="polite">
          {banner.message}
        </div>
      ) : null}

      {topPopup ? (
        <div
          className="site-popup-backdrop-v2"
          role="dialog"
          aria-modal="true"
          aria-label="Site update"
          onClick={() => handleDismissPopup(topPopup.id)}
        >
          <div className="site-popup-v2" onClick={(event) => event.stopPropagation()}>
            <p>{topPopup.message}</p>
            <button className="btn btn-primary" type="button" onClick={() => handleDismissPopup(topPopup.id)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
