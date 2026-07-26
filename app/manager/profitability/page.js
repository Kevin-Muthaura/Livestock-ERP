"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getFarmContext } from "@/lib/auth";

const PERIODS = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function ProfitabilityPage() {
  const [farm, setFarm] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) return;
      setFarm(ctx);
    });
  }, []);

  useEffect(() => {
    if (farm) loadData(farm.farm_id, periodDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm, periodDays]);

  async function loadData(farm_id, days) {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const [{ data: animals }, { data: costs }, { data: milk }, { data: revenues }] = await Promise.all([
      supabase.from("animals").select("id, tag_id, name, status").eq("farm_id", farm_id).neq("status", "sold").neq("status", "dead"),
      // Costs are tagged with animal_id at the point of entry (feed and vet logging both attach it)
      supabase.from("costs").select("animal_id, amount").eq("farm_id", farm_id).gte("date", sinceStr).not("animal_id", "is", null),
      supabase.from("milk_records").select("animal_id, yield_litres").eq("farm_id", farm_id).gte("session_date", sinceStr).not("animal_id", "is", null),
      supabase.from("revenues").select("amount, type").eq("farm_id", farm_id).gte("date", sinceStr),
    ]);

    const costByAnimal = {};
    (costs || []).forEach((c) => {
      costByAnimal[c.animal_id] = (costByAnimal[c.animal_id] || 0) + Number(c.amount);
    });

    const litresByAnimal = {};
    let totalLitres = 0;
    (milk || []).forEach((m) => {
      litresByAnimal[m.animal_id] = (litresByAnimal[m.animal_id] || 0) + Number(m.yield_litres);
      totalLitres += Number(m.yield_litres);
    });

    const totalMilkRevenue = (revenues || [])
      .filter((r) => r.type === "milk_sale")
      .reduce((s, r) => s + Number(r.amount), 0);

    // Milk revenue isn't recorded per-animal (it's sold in bulk), so we allocate it
    // proportionally to how many litres each animal contributed in the same period.
    // This is a fair estimate, not an exact accounting figure — shown as such in the UI.
    const computed = (animals || []).map((a) => {
      const litres = litresByAnimal[a.id] || 0;
      const allocatedRevenue = totalLitres > 0 ? totalMilkRevenue * (litres / totalLitres) : 0;
      const cost = costByAnimal[a.id] || 0;
      return {
        ...a,
        litres,
        revenue: allocatedRevenue,
        cost,
        profit: allocatedRevenue - cost,
      };
    });

    computed.sort((x, y) => y.profit - x.profit);
    setRows(computed);
    setLoading(false);
  }

  const best = rows.slice(0, 3);
  const worst = [...rows].reverse().slice(0, 3).filter((r) => !best.includes(r));

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-teal-800">📊 Per-Animal Profitability</h1>
        <Link href="/manager" className="text-sm text-neutral-400 underline">
          ← Dashboard
        </Link>
      </div>

      <div className="flex gap-2 mb-6">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => setPeriodDays(p.days)}
            className={`px-3 py-1 rounded-full text-sm ${periodDays === p.days ? "bg-teal-700 text-white" : "bg-neutral-100"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-neutral-400 bg-neutral-50 border rounded-xl p-3 mb-6">
        Milk revenue is shared out across animals based on how much each one produced, since milk is usually sold in
        bulk. Feed and vet costs are exact, taken from what was logged against each animal.
      </p>

      {loading && <p className="text-neutral-400">Loading…</p>}

      {!loading && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="font-semibold text-green-800 mb-2">🏆 Best performers</p>
              {best.map((r) => (
                <RankRow key={r.id} row={r} currency={farm?.currency} />
              ))}
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="font-semibold text-red-800 mb-2">⚠️ Underperforming</p>
              {worst.map((r) => (
                <RankRow key={r.id} row={r} currency={farm?.currency} />
              ))}
              {worst.length === 0 && <p className="text-xs text-red-700">Not enough data yet, or fewer than 4 animals.</p>}
            </div>
          </div>

          <h2 className="font-semibold mb-2">All animals</h2>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="bg-white border rounded-xl p-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold">
                    {r.tag_id} {r.name && `— ${r.name}`}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {r.litres.toFixed(0)} L · Revenue {farm?.currency} {Math.round(r.revenue).toLocaleString()} · Cost{" "}
                    {farm?.currency} {Math.round(r.cost).toLocaleString()}
                  </p>
                </div>
                <span className={`font-bold ${r.profit >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {r.profit >= 0 ? "+" : ""}
                  {farm?.currency} {Math.round(r.profit).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-neutral-400 text-center py-8">
          No cost or milk data yet for this period. Numbers will appear as workers log milk, feed, and health entries.
        </p>
      )}
    </main>
  );
}

function RankRow({ row, currency }) {
  return (
    <div className="flex justify-between text-sm mb-1">
      <span>{row.tag_id}</span>
      <span className={row.profit >= 0 ? "text-green-700" : "text-red-600"}>
        {currency} {Math.round(row.profit).toLocaleString()}
      </span>
    </div>
  );
}
