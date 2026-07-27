"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { markNotificationRead } from "@/lib/notifications";
import { getFarmContext } from "@/lib/auth";

const TYPE_STYLE = {
  alert: { icon: "🚨", color: "text-red-700", bg: "bg-red-50" },
  reminder: { icon: "⏰", color: "text-blue-700", bg: "bg-blue-50" },
  warning: { icon: "⚠️", color: "text-amber-700", bg: "bg-amber-50" },
};

const CATEGORY_ROUTE = {
  breeding: "/manager/breeding",
  health: "/manager/animals",
  inventory: "/manager/finance",
  finance: "/manager/finance",
};

export default function NotificationBell({ targetHref = "/manager/notifications" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [farmId, setFarmId] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    getFarmContext().then((ctx) => ctx && setFarmId(ctx.farm_id));
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const notifications = useLiveQuery(async () => {
    if (!farmId) return [];
    const all = await db.notifications.where("farm_id").equals(farmId).toArray();
    return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [farmId]);

  const unread = (notifications || []).filter((n) => !n.read_status);
  const recent = (notifications || []).slice(0, 6);

  async function handleTap(n) {
    if (!n.read_status) await markNotificationRead(n.id);
    setOpen(false);
    const route = CATEGORY_ROUTE[n.category];
    if (route) router.push(route);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-10 h-10 rounded-full bg-white border flex items-center justify-center text-xl"
      >
        🔔
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[85vw] bg-white border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-sm">Notifications</span>
            {unread.length > 0 && <span className="text-xs text-neutral-500">{unread.length} unread</span>}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y">
            {recent.length === 0 && <p className="p-4 text-sm text-neutral-400 text-center">Nothing to show — you're all caught up.</p>}
            {recent.map((n) => {
              const style = TYPE_STYLE[n.type] || TYPE_STYLE.reminder;
              return (
                <button
                  key={n.id}
                  onClick={() => handleTap(n)}
                  className={`w-full text-left px-4 py-3 flex gap-2 ${n.read_status ? "opacity-60" : style.bg}`}
                >
                  <span className="text-lg">{style.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-semibold ${style.color}`}>{n.title}</span>
                    <span className="block text-xs text-neutral-600 truncate">{n.message}</span>
                  </span>
                  {!n.read_status && <span className="w-2 h-2 mt-1 rounded-full bg-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              router.push(targetHref);
            }}
            className="w-full text-center text-sm text-blue-700 font-semibold py-3 border-t"
          >
            View all
          </button>
        </div>
      )}
    </div>
  );
}
