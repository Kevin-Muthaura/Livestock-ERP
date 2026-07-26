"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getFarmContext } from "@/lib/auth";

export default function AnimalsListPage() {
  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const ctx = await getFarmContext();
      if (!ctx) return;
      const { data } = await supabase
        .from("animals")
        .select("id, tag_id, name, breed, sex, status, date_of_birth")
        .eq("farm_id", ctx.farm_id)
        .order("created_at", { ascending: false });
      setAnimals(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = filter === "all" ? animals : animals.filter((a) => a.status === filter);
  const statuses = ["all", "calf", "heifer", "lactating", "dry", "sold", "dead"];

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-green-800">🐄 Animals</h1>
        <Link href="/manager" className="text-sm text-neutral-400 underline">
          ← Dashboard
        </Link>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
              filter === s ? "bg-green-700 text-white" : "bg-neutral-100"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <p className="text-neutral-400">Loading…</p>}

      <div className="space-y-2">
        {filtered.map((a) => (
          <div key={a.id} className="bg-white border rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold">
                {a.tag_id} {a.name && `— ${a.name}`}
              </p>
              <p className="text-xs text-neutral-500">
                {a.breed || "Unknown breed"} · {a.sex} · {a.status}
              </p>
            </div>
            <span className="text-2xl">🐄</span>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-neutral-400 text-center py-8">No animals in this category yet.</p>
        )}
      </div>
    </main>
  );
}
