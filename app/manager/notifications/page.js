"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getFarmContext } from "@/lib/auth";
import { markNotificationRead, markAllRead, refreshNotifications } from "@/lib/notifications";

const TYPE_STYLE = {
  alert: { icon: "🚨", label: "Alerts", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  reminder: { icon: "⏰", label: "Reminders", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  warning: { icon: "⚠️", label: "Warnings", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
};

export default function NotificationsPage() {
  const [farmId, setFarmId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getFarmContext().then((ctx) => ctx && setFarmId(ctx.farm_id));
  }, []);

  const notifications = useLiveQuery(async () => {
    if (!farmId) return [];
    const all = await db.notifications.where("farm_id").equals(farmId).toArray();
    return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [farmId]);

  const filtered = (notifications || []).filter((n) => filter === "all" || n.type === filter);
  const unreadIds = (notifications || []).filter((n) => !n.read_status).map((n) => n.id);

  async function handleRefresh() {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  }

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-neutral-800">🔔 Notifications</h1>
        <Link href="/manager" className="text-sm text-neutral-400 underline">
          ← Dashboard
        </Link>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {["all", "alert", "reminder", "warning"].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap font-medium ${
              filter === t ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {t === "all" ? "All" : `${TYPE_STYLE[t].icon} ${TYPE_STYLE[t].label}`}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-sm bg-neutral-100 rounded-full px-3 py-1.5 font-medium"
        >
          {refreshing ? "Checking…" : "🔄 Check for updates"}
        </button>
        {unreadIds.length > 0 && (
          <button
            onClick={() => markAllRead(unreadIds)}
            className="text-sm bg-neutral-100 rounded-full px-3 py-1.5 font-medium"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filtered.map((n) => {
          const style = TYPE_STYLE[n.type] || TYPE_STYLE.reminder;
          return (
            <button
              key={n.id}
              onClick={() => !n.read_status && markNotificationRead(n.id)}
              className={`w-full text-left border rounded-xl p-4 flex gap-3 ${n.read_status ? "bg-white" : style.bg}`}
            >
              <span className="text-2xl">{style.icon}</span>
              <span className="flex-1 min-w-0">
                <span className={`block font-semibold ${style.color}`}>{n.title}</span>
                <span className="block text-sm text-neutral-600">{n.message}</span>
                <span className="block text-xs text-neutral-400 mt-1">
                  {new Date(n.created_at).toLocaleString()} {n.read_status ? "· Read" : ""}
                </span>
              </span>
              {!n.read_status && <span className="w-2 h-2 mt-1 rounded-full bg-blue-600 shrink-0" />}
            </button>
          );
        })}
        {notifications && filtered.length === 0 && (
          <p className="text-neutral-400 text-center py-12">Nothing here — you're all caught up.</p>
        )}
      </div>
    </main>
  );
}
