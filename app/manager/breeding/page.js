"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getFarmContext } from "@/lib/auth";

const EVENT_LABELS = {
  calving_due: { label: "Calving due soon", icon: "🐣", color: "bg-red-50 border-red-200 text-red-800" },
  pregnancy_check_due: { label: "Pregnancy check overdue", icon: "🤰", color: "bg-amber-50 border-amber-200 text-amber-800" },
  next_heat_expected: { label: "Next heat window expected", icon: "🔥", color: "bg-orange-50 border-orange-200 text-orange-800" },
};

export default function BreedingDashboardPage() {
  const [farm, setFarm] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calvingForm, setCalvingForm] = useState(null); // breeding_record_id being recorded

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) return;
      setFarm(ctx);
      loadAll(ctx.farm_id);
    });
  }, []);

  async function loadAll(farm_id) {
    setLoading(true);
    const [{ data: rem }, { data: recs }] = await Promise.all([
      supabase.from("upcoming_breeding_events").select("*").eq("farm_id", farm_id),
      supabase
        .from("breeding_records")
        .select("*, animals(tag_id, name)")
        .eq("farm_id", farm_id)
        .order("created_at", { ascending: false }),
    ]);
    setReminders(rem || []);
    setRecords(recs || []);
    setLoading(false);
  }

  async function handleRecordCalving(record, outcome) {
    const today = new Date().toISOString().slice(0, 10);
    await supabase
      .from("breeding_records")
      .update({ actual_calving_date: today })
      .eq("id", record.id);

    if (outcome === "alive") {
      // Dam typically starts lactating after calving
      await supabase.from("animals").update({ status: "lactating" }).eq("id", record.animal_id);
    }

    setCalvingForm(null);
    loadAll(farm.farm_id);
  }

  const activePregnancies = records.filter((r) => r.pregnancy_confirmed && !r.actual_calving_date);

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-purple-800">🐣 Breeding & Calving</h1>
        <Link href="/manager" className="text-sm text-neutral-400 underline">
          ← Dashboard
        </Link>
      </div>

      {loading && <p className="text-neutral-400">Loading…</p>}

      <h2 className="font-semibold mb-2">Reminders</h2>
      <div className="space-y-2 mb-6">
        {reminders.length === 0 && !loading && (
          <p className="text-sm text-neutral-400 bg-white border rounded-xl p-4">No reminders right now. 🎉</p>
        )}
        {reminders.map((r) => {
          const meta = EVENT_LABELS[r.event_type] || { label: r.event_type, icon: "•", color: "bg-neutral-50 border-neutral-200" };
          return (
            <div key={r.breeding_record_id} className={`border rounded-xl p-3 flex items-center justify-between ${meta.color}`}>
              <div>
                <p className="font-semibold text-sm">
                  {meta.icon} {r.tag_id} {r.animal_name && `— ${r.animal_name}`}
                </p>
                <p className="text-xs opacity-80">{meta.label}</p>
              </div>
              {r.event_type === "calving_due" && (
                <button
                  onClick={() => setCalvingForm(r)}
                  className="text-xs bg-white border rounded-full px-3 py-1 font-semibold"
                >
                  Record calving
                </button>
              )}
            </div>
          );
        })}
      </div>

      {calvingForm && (
        <div className="bg-white border-2 border-purple-300 rounded-xl p-4 mb-6">
          <p className="font-semibold mb-3">
            Record calving for {calvingForm.tag_id} {calvingForm.animal_name && `— ${calvingForm.animal_name}`}
          </p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => handleRecordCalving(calvingForm, "alive")}
              className="bg-green-700 text-white rounded-xl p-3 font-semibold"
            >
              🐄 Calf born alive
            </button>
            <button
              onClick={() => handleRecordCalving(calvingForm, "dead")}
              className="bg-neutral-600 text-white rounded-xl p-3 font-semibold"
            >
              Calf lost
            </button>
          </div>
          <p className="text-xs text-neutral-400">
            Tip: normally you don't need this button — when a worker registers the new calf from Worker → Animal → Birth
            and selects {calvingForm.tag_id} as the dam, this all happens automatically. Use this only as a fallback
            (e.g. recording a stillbirth, or a calving reported by phone before the calf is tagged).
          </p>
          <button onClick={() => setCalvingForm(null)} className="text-sm text-neutral-400 underline mt-2">
            Cancel
          </button>
        </div>
      )}

      <h2 className="font-semibold mb-2">Active pregnancies ({activePregnancies.length})</h2>
      <div className="space-y-2 mb-6">
        {activePregnancies.map((r) => (
          <div key={r.id} className="bg-white border rounded-xl p-3 flex justify-between text-sm">
            <span>
              {r.animals?.tag_id} {r.animals?.name && `— ${r.animals.name}`}
            </span>
            <span className="text-neutral-500">Expected: {r.expected_calving_date}</span>
          </div>
        ))}
        {activePregnancies.length === 0 && !loading && (
          <p className="text-sm text-neutral-400">No confirmed pregnancies yet.</p>
        )}
      </div>

      <h2 className="font-semibold mb-2">Full breeding history</h2>
      <div className="space-y-2">
        {records.map((r) => (
          <div key={r.id} className="bg-white border rounded-xl p-3 text-sm">
            <p className="font-semibold">
              {r.animals?.tag_id} {r.animals?.name && `— ${r.animals.name}`}
            </p>
            <p className="text-xs text-neutral-500">
              Heat: {r.heat_date || "—"} · Service: {r.service_date || "—"} ·{" "}
              Pregnant: {r.pregnancy_confirmed === null ? "unknown" : r.pregnancy_confirmed ? "yes" : "no"} ·{" "}
              Calved: {r.actual_calving_date || "—"}
            </p>
          </div>
        ))}
        {records.length === 0 && !loading && <p className="text-sm text-neutral-400">No breeding records yet.</p>}
      </div>
    </main>
  );
}
