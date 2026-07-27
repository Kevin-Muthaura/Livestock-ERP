"use client";

import { useEffect } from "react";
import { initSyncEngine } from "@/lib/sync";
import { refreshLocalCache } from "@/lib/refreshCache";
import { refreshNotifications } from "@/lib/notifications";

export default function SyncInit() {
  useEffect(() => {
    initSyncEngine();
    refreshLocalCache();
    window.addEventListener("online", refreshLocalCache);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    }

    // Notifications are time-sensitive (an invoice becomes overdue, a
    // calving date arrives) even if the user doesn't take any action, so
    // check for fresh ones periodically for sessions left open a while.
    const notifInterval = setInterval(refreshNotifications, 2 * 60 * 1000);

    return () => {
      window.removeEventListener("online", refreshLocalCache);
      clearInterval(notifInterval);
    };
  }, []);

  return null;
}
