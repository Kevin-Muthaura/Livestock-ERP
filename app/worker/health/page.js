"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, queueWrite, TIER } from "@/lib/db";
import { getFarmContext } from "@/lib/auth";
import PendingBadge from "@/components/PendingBadge";

export default function HealthEntryPage() {
  const router = useRouter();
  const [farm, setFarm] = useState(null);
  const [animalId, setAnimalId] = useState("");
  const [diagnosisId, setDiagnosisId] = useState("");
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");
  const [saved, setSaved] = useState(false);

  const animals = useLiveQuery(
    () => (farm ? db.animals.where("farm_id").equals(farm.farm_id).toArray() : []),
    [farm]
  );
  const diagnoses = useLiveQuery(() => db.diagnosis_catalogue.toArray(), []);

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) router.push("/");
      else setFarm(ctx);
    });
  }, [router]);

  async function handleSave() {
    if (!animalId || !diagnosisId) return;
    await queueWrite("health_records", TIER.FINANCIAL_HEALTH, {
      farm_id: farm.farm_id,
      animal_id: animalId,
      event_date: new Date().toISOString().slice(0, 10),
      type: "treatment",
      diagnosis_id: diagnosisId,
      diagnosis_note: note || null,
      cost: cost ? Number(cost) : 0,
    });
    if (cost && Number(cost) > 0) {
      await queueWrite("costs", TIER.FINANCIAL_HEALTH, {
        farm_id: farm.farm_id,
        category: "vet",
        amount: Number(cost),
        date: new Date().toISOString().slice(0, 10),
        animal_id: animalId,
        description: "Health treatment",
      });
    }
    setSaved(true);
    setTimeout(() => router.push("/worker"), 900);
  }

  return (
    <main className="flex-1 p-6 flex flex-col max-w-sm mx-auto w-full">
      <h1 className="text-xl font-bold text-rose-800 mb-1">🩺 Health Entry</h1>
      <p className="text-sm text-neutral-500 mb-6">Saves instantly, even with no signal.</p>

      <label className="block text-sm font-medium mb-2">Which animal?</label>
      <select
        value={animalId}
        onChange={(e) => setAnimalId(e.target.value)}
        className="w-full border rounded-xl p-4 text-lg mb-6"
      >
        <option value="">Select animal…</option>
        {(animals || []).map((a) => (
          <option key={a.id} value={a.id}>
            {a.tag_id} {a.name ? `— ${a.name}` : ""}
          </option>
        ))}
      </select>

      <label className="block text-sm font-medium mb-2">What's wrong? / Nini tatizo?</label>
      <div className="grid grid-cols-2 gap-2 mb-6 max-h-64 overflow-y-auto">
        {(diagnoses || []).map((d) => (
          <button
            key={d.id}
            onClick={() => setDiagnosisId(d.id)}
            className={`rounded-xl p-3 border-2 text-left ${
              diagnosisId === d.id ? "border-rose-700 bg-rose-50" : "border-neutral-200"
            }`}
          >
            <div className="font-semibold text-sm">{d.name}</div>
            {d.name_sw && <div className="text-xs text-neutral-500">{d.name_sw}</div>}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium mb-2">Note (optional)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note, or describe if you picked 'Other'"
        className="w-full border rounded-xl p-4 mb-6"
        rows={2}
      />

      <label className="block text-sm font-medium mb-2">Treatment cost ({farm?.farm_name ? "" : ""}optional)</label>
      <input
        type="number"
        inputMode="decimal"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        placeholder="0"
        className="w-full border rounded-xl p-4 text-lg mb-8"
      />

      <button
        onClick={handleSave}
        disabled={!animalId || !diagnosisId || saved}
        className="w-full bg-rose-700 disabled:bg-neutral-300 text-white rounded-xl p-4 text-lg font-semibold"
      >
        {saved ? "Saved ✓" : "Save"}
      </button>
      <button onClick={() => router.push("/worker")} className="w-full text-sm text-neutral-400 underline mt-4">
        Cancel
      </button>

      <PendingBadge />
    </main>
  );
}
