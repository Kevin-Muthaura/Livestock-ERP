"use client";

import { useEffect, useState } from "react";
import { pendingCount, flushPendingWrites } from "@/lib/sync";

export default function PendingBadge() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => pendingCount().then(setCount);
    update();
    setOnline(navigator.onLine);

    const interval = setInterval(update, 4000);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (count === 0 && online) return null;

  return (
    <button
      onClick={() => flushPendingWrites()}
      className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium shadow-lg ${
        online ? "bg-amber-500 text-white" : "bg-neutral-700 text-white"
      }`}
    >
      {!online ? "Offline — " : ""}
      {count > 0 ? `${count} record${count === 1 ? "" : "s"} pending sync` : "Back online, synced ✓"}
    </button>
  );
}
