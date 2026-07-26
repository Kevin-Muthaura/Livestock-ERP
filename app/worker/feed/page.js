"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, queueWrite, TIER } from "@/lib/db";
import { getFarmContext } from "@/lib/auth";
import PendingBadge from "@/components/PendingBadge";

export default function FeedEntryPage() {
  const router = useRouter();
  const [farm, setFarm] = useState(null);
  const [animalId, setAnimalId] = useState("");
  const [feedTypeId, setFeedTypeId] = useState("");
  const [quantity, setQuantity] = useState(5);
  const [saved, setSaved] = useState(false);

  const animals = useLiveQuery(
    () => (farm ? db.animals.where("farm_id").equals(farm.farm_id).toArray() : []),
    [farm]
  );
  const feedTypes = useLiveQuery(
    () => (farm ? db.feed_types.where("farm_id").equals(farm.farm_id).toArray() : []),
    [farm]
  );

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) router.push("/");
      else setFarm(ctx);
    });
  }, [router]);

  async function handleSave() {
    if (!animalId || !feedTypeId) return;
    const feedType = (feedTypes || []).find((f) => f.id === feedTypeId);
    const cost = feedType ? feedType.cost_per_unit * quantity : 0;

    await queueWrite("feeding_logs", TIER.FINANCIAL_HEALTH, {
      farm_id: farm.farm_id,
      animal_id: animalId,
      feed_type_id: feedTypeId,
      quantity,
      date: new Date().toISOString().slice(0, 10),
      cost,
    });
    await queueWrite("costs", TIER.FINANCIAL_HEALTH, {
      farm_id: farm.farm_id,
      category: "feed",
      amount: cost,
      date: new Date().toISOString().slice(0, 10),
      animal_id: animalId,
      description: `Feed: ${feedType?.name || ""}`,
    });
    setSaved(true);
    setTimeout(() => router.push("/worker"), 900);
  }

  return (
    <main className="flex-1 p-6 flex flex-col max-w-sm mx-auto w-full">
      <h1 className="text-xl font-bold text-amber-800 mb-1">🌾 Feed Entry</h1>
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

      <label className="block text-sm font-medium mb-2">Feed type</label>
      <select
        value={feedTypeId}
        onChange={(e) => setFeedTypeId(e.target.value)}
        className="w-full border rounded-xl p-4 text-lg mb-6"
      >
        <option value="">Select feed…</option>
        {(feedTypes || []).map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} ({f.unit})
          </option>
        ))}
      </select>

      <label className="block text-sm font-medium mb-2">Quantity</label>
      <div className="flex items-center justify-center gap-6 mb-8">
        <button onClick={() => setQuantity((q) => Math.max(0, q - 1))} className="w-16 h-16 rounded-full bg-neutral-200 text-3xl font-bold">
          −
        </button>
        <div className="text-4xl font-bold w-24 text-center">{quantity}</div>
        <button onClick={() => setQuantity((q) => q + 1)} className="w-16 h-16 rounded-full bg-neutral-200 text-3xl font-bold">
          +
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={!animalId || !feedTypeId || saved}
        className="w-full bg-amber-700 disabled:bg-neutral-300 text-white rounded-xl p-4 text-lg font-semibold"
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
