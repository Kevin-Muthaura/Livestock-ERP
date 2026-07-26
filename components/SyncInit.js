"use client";

import { useEffect } from "react";
import { initSyncEngine } from "@/lib/sync";
import { refreshLocalCache } from "@/lib/refreshCache";

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

    return () => window.removeEventListener("online", refreshLocalCache);
  }, []);

  return null;
}
