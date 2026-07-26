"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getFarmContext, signOutLocal } from "@/lib/auth";

export default function ManagerDashboard() {
  const router = useRouter();
  const [farm, setFarm] = useState(null);
  const [stats, setStats] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const ctx = await getFarmContext();
      if (!ctx) return router.push("/");
      setFarm(ctx);

      if (!navigator.onLine) {
        setLoading(false);
        return;
      }

      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceStr = since.toISOString().slice(0, 10);

      const [{ data: costs }, { data: revenues }, { data: animals }, { data: invoices }, { data: feedInv }, { data: breedingEvents }] =
        await Promise.all([
          supabase.from("costs").select("amount").eq("farm_id", ctx.farm_id).gte("date", sinceStr),
          supabase.from("revenues").select("amount").eq("farm_id", ctx.farm_id).gte("date", sinceStr),
          supabase.from("animals").select("status").eq("farm_id", ctx.farm_id),
          supabase
            .from("invoices")
            .select("amount, paid_amount, status")
            .eq("farm_id", ctx.farm_id)
            .neq("status", "paid"),
          supabase.from("feed_inventory").select("quantity, reorder_level, feed_types(name)").eq("farm_id", ctx.farm_id),
          supabase.from("upcoming_breeding_events").select("breeding_record_id").eq("farm_id", ctx.farm_id),
        ]);

      const totalCost = (costs || []).reduce((s, c) => s + Number(c.amount), 0);
      const totalRevenue = (revenues || []).reduce((s, r) => s + Number(r.amount), 0);
      const outstanding = (invoices || []).reduce((s, i) => s + (Number(i.amount) - Number(i.paid_amount || 0)), 0);

      const statusCounts = {};
      (animals || []).forEach((a) => {
        statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
      });

      setStats({
        totalCost,
        totalRevenue,
        profit: totalRevenue - totalCost,
        outstanding,
        totalAnimals: (animals || []).length,
        statusCounts,
        breedingReminders: (breedingEvents || []).length,
      });

      setLowStock((feedInv || []).filter((f) => Number(f.quantity) <= Number(f.reorder_level)));
      setLoading(false);
    })();
  }, [router]);

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-neutral-500">Farm overview (last 30 days)</p>
          <h1 className="text-xl font-bold text-green-800">{farm?.farm_name || "Your Farm"}</h1>
        </div>
        <button
          onClick={async () => {
            await signOutLocal();
            router.push("/");
          }}
          className="text-sm text-neutral-400 underline"
        >
          Sign out
        </button>
      </div>

      {!navigator?.onLine && (
        <p className="bg-neutral-100 text-neutral-600 text-sm rounded-xl p-3 mb-6">
          You're offline — dashboard needs a connection to fetch the latest numbers. Worker entry screens still work offline.
        </p>
      )}

      {loading && <p className="text-neutral-400">Loading…</p>}

      {stats && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard label="Revenue" value={stats.totalRevenue} currency={farm?.currency} positive />
            <StatCard label="Cost" value={stats.totalCost} currency={farm?.currency} />
            <StatCard
              label="Profit"
              value={stats.profit}
              currency={farm?.currency}
              positive={stats.profit >= 0}
              highlight
            />
          </div>

          {stats.outstanding > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="font-semibold text-amber-800">Outstanding receivables</p>
              <p className="text-2xl font-bold text-amber-800">
                {farm?.currency} {stats.outstanding.toLocaleString()}
              </p>
              <p className="text-xs text-amber-700">Money customers still owe you</p>
            </div>
          )}

          {lowStock.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="font-semibold text-red-800 mb-2">⚠️ Low stock alerts</p>
              {lowStock.map((item, i) => (
                <p key={i} className="text-sm text-red-700">
                  {item.feed_types?.name}: {item.quantity} left (reorder at {item.reorder_level})
                </p>
              ))}
            </div>
          )}

          <div className="bg-white border rounded-xl p-4 mb-6">
            <p className="font-semibold mb-2">Herd ({stats.totalAnimals} animals)</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.statusCounts).map(([status, count]) => (
                <span key={status} className="text-xs bg-neutral-100 rounded-full px-3 py-1">
                  {status}: {count}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/manager/animals" className="bg-green-700 text-white rounded-xl p-4 text-center font-semibold">
          🐄 Animals
        </Link>
        <Link href="/manager/breeding" className="bg-purple-700 text-white rounded-xl p-4 text-center font-semibold relative">
          🐣 Breeding
          {stats?.breedingReminders > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
              {stats.breedingReminders}
            </span>
          )}
        </Link>
        <Link href="/manager/finance" className="bg-blue-700 text-white rounded-xl p-4 text-center font-semibold">
          💵 Finance
        </Link>
        <Link href="/manager/profitability" className="bg-teal-700 text-white rounded-xl p-4 text-center font-semibold">
          📊 Profitability
        </Link>
        <Link href="/manager/customers" className="bg-indigo-700 text-white rounded-xl p-4 text-center font-semibold">
          🧾 Customers
        </Link>
        <Link href="/manager/team" className="bg-neutral-700 text-white rounded-xl p-4 text-center font-semibold">
          👥 Team
        </Link>
        <Link href="/worker" className="bg-neutral-500 text-white rounded-xl p-4 text-center font-semibold col-span-2">
          📱 Worker view
        </Link>
      </div>
    </main>
  );
}

function StatCard({ label, value, currency, positive, highlight }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-green-50 border border-green-200" : "bg-white border"}`}>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-lg font-bold ${positive === false ? "text-red-600" : "text-neutral-900"}`}>
        {currency} {Math.round(value).toLocaleString()}
      </p>
    </div>
  );
}
