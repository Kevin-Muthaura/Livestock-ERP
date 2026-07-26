"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, queueWrite, TIER } from "@/lib/db";
import { getFarmContext } from "@/lib/auth";
import PendingBadge from "@/components/PendingBadge";

const ACQUISITION_OPTIONS = [
  { value: "birth", label: "Birth", icon: "🐣" },
  { value: "purchase", label: "Purchase", icon: "💰" },
  { value: "transfer_in", label: "Transfer in", icon: "🚚" },
];

export default function NewAnimalPage() {
  const router = useRouter();
  const [farm, setFarm] = useState(null);
  const [acquisition, setAcquisition] = useState("birth");
  const [tagId, setTagId] = useState("");
  const [name, setName] = useState("");
  const [sex, setSex] = useState("female");
  const [breed, setBreed] = useState("");
  const [dob, setDob] = useState(new Date().toISOString().slice(0, 10));
  const [damBreedingId, setDamBreedingId] = useState("");
  const [saved, setSaved] = useState(false);

  // Auto-suggest candidate dams: confirmed-pregnant, not yet calved — closest
  // expected calving date to today shown first (Section E.1 of the architecture doc).
  const candidateDams = useLiveQuery(async () => {
    if (!farm) return [];
    const open = await db.breeding_records
      .where("farm_id")
      .equals(farm.farm_id)
      .filter((r) => r.pregnancy_confirmed === true && !r.actual_calving_date)
      .toArray();

    const withAnimal = await Promise.all(
      open.map(async (r) => ({ ...r, dam: await db.animals.get(r.animal_id) }))
    );
    return withAnimal
      .filter((r) => r.dam)
      .sort((a, b) => new Date(a.expected_calving_date || 0) - new Date(b.expected_calving_date || 0));
  }, [farm]);

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) router.push("/");
      else setFarm(ctx);
    });
  }, [router]);

  async function handleSave() {
    if (!tagId) return;

    const newAnimal = await queueWrite("animals", TIER.FINANCIAL_HEALTH, {
      farm_id: farm.farm_id,
      tag_id: tagId,
      name: name || null,
      breed: breed || null,
      sex,
      date_of_birth: dob,
      dam_id: acquisition === "birth" && damBreedingId ? candidateDamRecord()?.animal_id : null,
      status: "calf",
      acquisition_type: acquisition,
    });

    // Close the loop: link this calf to the dam's breeding record and flip
    // the dam to lactating, so the breeding cycle (heat -> service ->
    // pregnancy -> calving) is fully resolved in one worker action.
    if (acquisition === "birth" && damBreedingId) {
      const openRecord = candidateDamRecord();
      if (openRecord) {
        await queueWrite("breeding_records", TIER.FINANCIAL_HEALTH, {
          ...openRecord,
          actual_calving_date: dob,
          calf_id: newAnimal.id,
        });
        const dam = await db.animals.get(openRecord.animal_id);
        if (dam) {
          await queueWrite("animals", TIER.FINANCIAL_HEALTH, { ...dam, status: "lactating" });
        }
      }
    }

    setSaved(true);
    setTimeout(() => router.push("/worker"), 900);
  }

  function candidateDamRecord() {
    return (candidateDams || []).find((r) => r.id === damBreedingId);
  }

  return (
    <main className="flex-1 p-6 flex flex-col max-w-sm mx-auto w-full">
      <h1 className="text-xl font-bold text-green-800 mb-1">🐄 New Animal</h1>
      <p className="text-sm text-neutral-500 mb-6">Saves instantly, even with no signal.</p>

      <label className="block text-sm font-medium mb-2">How did this animal join the farm?</label>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {ACQUISITION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setAcquisition(opt.value)}
            className={`rounded-xl p-3 border-2 text-center ${
              acquisition === opt.value ? "border-green-700 bg-green-50" : "border-neutral-200"
            }`}
          >
            <div className="text-2xl">{opt.icon}</div>
            <div className="text-xs font-semibold">{opt.label}</div>
          </button>
        ))}
      </div>

      {acquisition === "birth" && (
        <>
          <label className="block text-sm font-medium mb-2">Which cow is the dam (mother)? (optional)</label>
          <div className="grid grid-cols-1 gap-2 mb-6">
            {(candidateDams || []).map((r) => (
              <button
                key={r.id}
                onClick={() => setDamBreedingId(r.id === damBreedingId ? "" : r.id)}
                className={`rounded-xl p-3 border-2 text-left ${
                  damBreedingId === r.id ? "border-green-700 bg-green-50" : "border-neutral-200"
                }`}
              >
                <span className="font-semibold">{r.dam?.tag_id}</span>
                {r.dam?.name && <span className="text-sm"> — {r.dam.name}</span>}
                <span className="block text-xs text-neutral-500">
                  Expected calving: {r.expected_calving_date || "unknown"}
                </span>
              </button>
            ))}
            {candidateDams && candidateDams.length === 0 && (
              <p className="text-sm text-neutral-400">
                No confirmed pregnancies on file. You can still register the calf — just link the dam later from Manager → Breeding if needed.
              </p>
            )}
          </div>
        </>
      )}

      <label className="block text-sm font-medium mb-2">Tag number (printed/QR sticker)</label>
      <input
        value={tagId}
        onChange={(e) => setTagId(e.target.value)}
        placeholder="e.g. K-014"
        className="w-full border rounded-xl p-4 text-lg mb-6"
      />

      <label className="block text-sm font-medium mb-2">Name (optional)</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Zawadi"
        className="w-full border rounded-xl p-4 text-lg mb-6"
      />

      <label className="block text-sm font-medium mb-2">Sex</label>
      <div className="grid grid-cols-2 gap-2 mb-6">
        <button
          onClick={() => setSex("female")}
          className={`rounded-xl p-3 border-2 font-semibold ${sex === "female" ? "border-green-700 bg-green-50" : "border-neutral-200"}`}
        >
          ♀ Female
        </button>
        <button
          onClick={() => setSex("male")}
          className={`rounded-xl p-3 border-2 font-semibold ${sex === "male" ? "border-green-700 bg-green-50" : "border-neutral-200"}`}
        >
          ♂ Male
        </button>
      </div>

      <label className="block text-sm font-medium mb-2">Breed (optional)</label>
      <input
        value={breed}
        onChange={(e) => setBreed(e.target.value)}
        placeholder="e.g. Friesian, Ayrshire, Sahiwal"
        className="w-full border rounded-xl p-4 text-lg mb-6"
      />

      <label className="block text-sm font-medium mb-2">Date of birth</label>
      <input
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        className="w-full border rounded-xl p-4 text-lg mb-8"
      />

      <button
        onClick={handleSave}
        disabled={!tagId || saved}
        className="w-full bg-green-700 disabled:bg-neutral-300 text-white rounded-xl p-4 text-lg font-semibold"
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
