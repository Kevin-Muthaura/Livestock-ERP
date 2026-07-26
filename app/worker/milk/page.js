"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, queueWrite, TIER } from "@/lib/db";
import { getFarmContext } from "@/lib/auth";
import PendingBadge from "@/components/PendingBadge";

export default function MilkEntryPage() {
  const router = useRouter();
  const [farm, setFarm] = useState(null);
  const [animalId, setAnimalId] = useState("");
  const [shift, setShift] = useState(currentShift());
  const [litres, setLitres] = useState(8);
  const [saved, setSaved] = useState(false);

  const animals = useLiveQuery(
    () => (farm ? db.animals.where("farm_id").equals(farm.farm_id).and((a) => a.status === "lactating").toArray() : []),
    [farm]
  );

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) router.push("/");
      else setFarm(ctx);
    });
  }, [router]);

  function currentShift() {
    const hour = new Date().getHours();
    return hour < 14 ? "morning" : "evening";
  }

  async function handleSave() {
    if (!animalId) return;
    await queueWrite("milk_records", TIER.MILK, {
      farm_id: farm.farm_id,
      animal_id: animalId,
      session_date: new Date().toISOString().slice(0, 10),
      shift,
      yield_litres: litres,
    });
    setSaved(true);
    setTimeout(() => router.push("/worker"), 900);
  }

  return (
    <main className="flex-1 p-6 flex flex-col max-w-sm mx-auto w-full">
      <h1 className="text-xl font-bold text-blue-800 mb-1">🥛 Milk Entry</h1>
      <p className="text-sm text-neutral-500 mb-6">Saves instantly, even with no signal.</p>

      <label className="block text-sm font-medium mb-2">Which animal?</label>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {(animals || []).map((a) => (
          <button
            key={a.id}
            onClick={() => setAnimalId(a.id)}
            className={`rounded-xl p-3 border-2 text-center ${
              animalId === a.id ? "border-blue-700 bg-blue-50" : "border-neutral-200"
            }`}
          >
            <div className="text-2xl">🐄</div>
            <div className="font-semibold text-sm">{a.tag_id}</div>
          </button>
        ))}
        {animals && animals.length === 0 && (
          <p className="col-span-3 text-sm text-neutral-400">
            No lactating animals yet. Register one from the Animal button first.
          </p>
        )}
      </div>

      <label className="block text-sm font-medium mb-2">Shift</label>
      <div className="grid grid-cols-2 gap-2 mb-6">
        <button
          onClick={() => setShift("morning")}
          className={`rounded-xl p-3 border-2 font-semibold ${shift === "morning" ? "border-blue-700 bg-blue-50" : "border-neutral-200"}`}
        >
          ☀️ Morning
        </button>
        <button
          onClick={() => setShift("evening")}
          className={`rounded-xl p-3 border-2 font-semibold ${shift === "evening" ? "border-blue-700 bg-blue-50" : "border-neutral-200"}`}
        >
          🌙 Evening
        </button>
      </div>

      <label className="block text-sm font-medium mb-2">Litres</label>
      <div className="flex items-center justify-center gap-6 mb-8">
        <button
          onClick={() => setLitres((l) => Math.max(0, +(l - 0.5).toFixed(1)))}
          className="w-16 h-16 rounded-full bg-neutral-200 text-3xl font-bold"
        >
          −
        </button>
        <div className="text-4xl font-bold w-24 text-center">{litres}</div>
        <button
          onClick={() => setLitres((l) => +(l + 0.5).toFixed(1))}
          className="w-16 h-16 rounded-full bg-neutral-200 text-3xl font-bold"
        >
          +
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={!animalId || saved}
        className="w-full bg-blue-700 disabled:bg-neutral-300 text-white rounded-xl p-4 text-lg font-semibold"
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
