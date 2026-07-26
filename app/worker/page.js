"use client";

import { useEffect, useState } from "react";
import BigButton from "@/components/BigButton";
import PendingBadge from "@/components/PendingBadge";
import { getFarmContext, signOutLocal } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function WorkerHome() {
  const router = useRouter();
  const [farmName, setFarmName] = useState("");

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) router.push("/");
      else setFarmName(ctx.farm_name);
    });
  }, [router]);

  return (
    <main className="flex-1 p-6 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-neutral-500">Today's tasks</p>
          <h1 className="text-xl font-bold text-green-800">{farmName || "Your Farm"}</h1>
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

      <div className="grid grid-cols-2 gap-4 flex-1">
        <BigButton href="/worker/milk" icon="🥛" label="Milk" sublabel="Record milking" color="bg-blue-700" />
        <BigButton href="/worker/feed" icon="🌾" label="Feed" sublabel="Log feeding" color="bg-amber-700" />
        <BigButton href="/worker/health" icon="🩺" label="Health" sublabel="Log treatment" color="bg-rose-700" />
        <BigButton href="/worker/animal/new" icon="🐄" label="Animal" sublabel="Register new" color="bg-green-700" />
      </div>

      <PendingBadge />
    </main>
  );
}
