"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, queueWrite, TIER } from "@/lib/db";
import { getOpenBreedingRecord } from "@/lib/refreshCache";
import { getFarmContext } from "@/lib/auth";
import PendingBadge from "@/components/PendingBadge";

const ACTIONS = [
  { value: "heat", label: "Heat detected", icon: "🔥", color: "border-orange-700 bg-orange-50", btn: "bg-orange-700" },
  { value: "service", label: "AI / Service done", icon: "💉", color: "border-purple-700 bg-purple-50", btn: "bg-purple-700" },
  { value: "pregnancy", label: "Pregnancy check", icon: "🤰", color: "border-pink-700 bg-pink-50", btn: "bg-pink-700" },
];

const GESTATION_DAYS = 283; // average bovine gestation

export default function BreedingEntryPage() {
  const router = useRouter();
  const [farm, setFarm] = useState(null);
  const [action, setAction] = useState("");
  const [animalId, setAnimalId] = useState("");
  const [bullOrSemenId, setBullOrSemenId] = useState("");
  const [pregnant, setPregnant] = useState(null); // true/false
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const animals = useLiveQuery(
    () =>
      farm
        ? db.animals
            .where("farm_id")
            .equals(farm.farm_id)
            .and((a) => a.sex === "female" && ["heifer", "lactating", "dry"].includes(a.status))
            .toArray()
        : [],
    [farm]
  );

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) router.push("/");
      else setFarm(ctx);
    });
  }, [router]);

  async function handleSave() {
    setError("");
    if (!animalId || !action) return;
    const today = new Date().toISOString().slice(0, 10);

    try {
      if (action === "heat") {
        await queueWrite("breeding_records", TIER.FINANCIAL_HEALTH, {
          farm_id: farm.farm_id,
          animal_id: animalId,
          heat_date: today,
        });
      } else if (action === "service") {
        const open = await getOpenBreedingRecord(animalId);
        const expected = addDays(today, GESTATION_DAYS);
        await queueWrite("breeding_records", TIER.FINANCIAL_HEALTH, {
          ...(open || { farm_id: farm.farm_id, animal_id: animalId }),
          id: open?.id,
          client_uuid: open?.client_uuid,
          service_date: today,
          bull_or_semen_id: bullOrSemenId || null,
          expected_calving_date: expected,
        });
      } else if (action === "pregnancy") {
        const open = await getOpenBreedingRecord(animalId);
        if (!open) {
          setError("No service recorded yet for this animal — log the service first.");
          return;
        }
        await queueWrite("breeding_records", TIER.FINANCIAL_HEALTH, {
          ...open,
          pregnancy_confirmed: pregnant,
        });
      }
      setSaved(true);
      setTimeout(() => router.push("/worker"), 900);
    } catch (err) {
      setError(err.message || "Could not save.");
    }
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const readyToSave =
    animalId &&
    action &&
    (action !== "pregnancy" || pregnant !== null);

  return (
    <main className="flex-1 p-6 flex flex-col max-w-sm mx-auto w-full">
      <h1 className="text-xl font-bold text-purple-800 mb-1">🐣 Breeding</h1>
      <p className="text-sm text-neutral-500 mb-6">Saves instantly, even with no signal.</p>

      <label className="block text-sm font-medium mb-2">What happened?</label>
      <div className="grid grid-cols-1 gap-2 mb-6">
        {ACTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setAction(opt.value);
              setPregnant(null);
              setError("");
            }}
            className={`rounded-xl p-4 border-2 flex items-center gap-3 text-left ${
              action === opt.value ? opt.color : "border-neutral-200"
            }`}
          >
            <span className="text-2xl">{opt.icon}</span>
            <span className="font-semibold">{opt.label}</span>
          </button>
        ))}
      </div>

      {action && (
        <>
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
        </>
      )}

      {action === "service" && (
        <>
          <label className="block text-sm font-medium mb-2">Bull / semen ID (optional)</label>
          <input
            value={bullOrSemenId}
            onChange={(e) => setBullOrSemenId(e.target.value)}
            placeholder="e.g. Friesian-204"
            className="w-full border rounded-xl p-4 text-lg mb-8"
          />
        </>
      )}

      {action === "pregnancy" && (
        <>
          <label className="block text-sm font-medium mb-2">Result</label>
          <div className="grid grid-cols-2 gap-2 mb-8">
            <button
              onClick={() => setPregnant(true)}
              className={`rounded-xl p-4 border-2 font-semibold ${
                pregnant === true ? "border-pink-700 bg-pink-50" : "border-neutral-200"
              }`}
            >
              ✓ Pregnant
            </button>
            <button
              onClick={() => setPregnant(false)}
              className={`rounded-xl p-4 border-2 font-semibold ${
                pregnant === false ? "border-neutral-700 bg-neutral-100" : "border-neutral-200"
              }`}
            >
              ✗ Not pregnant
            </button>
          </div>
        </>
      )}

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <button
        onClick={handleSave}
        disabled={!readyToSave || saved}
        className="w-full bg-purple-700 disabled:bg-neutral-300 text-white rounded-xl p-4 text-lg font-semibold"
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
