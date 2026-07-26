"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getFarmContext } from "@/lib/auth";

export default function FinancePage() {
  const [farm, setFarm] = useState(null);
  const [tab, setTab] = useState("cost");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("feed");
  const [revType, setRevType] = useState("milk_sale");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    getFarmContext().then(async (ctx) => {
      if (!ctx) return;
      setFarm(ctx);
      loadRecent(ctx.farm_id);
    });
  }, []);

  async function loadRecent(farm_id) {
    const [{ data: costs }, { data: revenues }] = await Promise.all([
      supabase.from("costs").select("*").eq("farm_id", farm_id).order("date", { ascending: false }).limit(5),
      supabase.from("revenues").select("*").eq("farm_id", farm_id).order("date", { ascending: false }).limit(5),
    ]);
    setRecent([
      ...(costs || []).map((c) => ({ ...c, kind: "cost" })),
      ...(revenues || []).map((r) => ({ ...r, kind: "revenue" })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount) return;
    const today = new Date().toISOString().slice(0, 10);

    if (tab === "cost") {
      await supabase.from("costs").insert({
        farm_id: farm.farm_id,
        category,
        amount: Number(amount),
        date: today,
        description,
      });
    } else {
      await supabase.from("revenues").insert({
        farm_id: farm.farm_id,
        type: revType,
        amount: Number(amount),
        date: today,
      });
    }

    setSaved(true);
    setAmount("");
    setDescription("");
    loadRecent(farm.farm_id);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <main className="flex-1 p-6 max-w-sm mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-blue-800">💵 Finance</h1>
        <Link href="/manager" className="text-sm text-neutral-400 underline">
          ← Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-6">
        <button
          onClick={() => setTab("cost")}
          className={`rounded-xl p-3 font-semibold ${tab === "cost" ? "bg-red-700 text-white" : "bg-neutral-100"}`}
        >
          Record cost
        </button>
        <button
          onClick={() => setTab("revenue")}
          className={`rounded-xl p-3 font-semibold ${tab === "revenue" ? "bg-green-700 text-white" : "bg-neutral-100"}`}
        >
          Record revenue
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        {tab === "cost" ? (
          <>
            <label className="block text-sm font-medium">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded-xl p-4">
              <option value="feed">Feed</option>
              <option value="vet">Vet</option>
              <option value="labour">Labour</option>
              <option value="other">Other</option>
            </select>
            <label className="block text-sm font-medium">Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border rounded-xl p-4" />
          </>
        ) : (
          <>
            <label className="block text-sm font-medium">Type</label>
            <select value={revType} onChange={(e) => setRevType(e.target.value)} className="w-full border rounded-xl p-4">
              <option value="milk_sale">Milk sale</option>
              <option value="animal_sale">Animal sale</option>
            </select>
          </>
        )}

        <label className="block text-sm font-medium">Amount ({farm?.currency})</label>
        <input
          type="number"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border rounded-xl p-4 text-lg"
        />

        <button className={`w-full text-white rounded-xl p-4 text-lg font-semibold ${tab === "cost" ? "bg-red-700" : "bg-green-700"}`}>
          {saved ? "Saved ✓" : "Save"}
        </button>
      </form>

      <h2 className="font-semibold mb-2">Recent entries</h2>
      <div className="space-y-2">
        {recent.map((r) => (
          <div key={`${r.kind}-${r.id}`} className="bg-white border rounded-xl p-3 flex justify-between text-sm">
            <span>{r.kind === "cost" ? r.category : r.type} · {r.date}</span>
            <span className={r.kind === "cost" ? "text-red-600" : "text-green-700"}>
              {r.kind === "cost" ? "-" : "+"}{farm?.currency} {Number(r.amount).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
