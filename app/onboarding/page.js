"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { cacheFarmContext, normalizePhone } from "@/lib/auth";
import { db } from "@/lib/db";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateFarm(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) throw new Error("Not signed in — go back and sign in again.");

      // The account's phone number lives in our local session cache (set at
      // login), since Supabase's auth.users.phone is only populated by the
      // phone/OTP provider, which this system no longer uses.
      const localAuth = await db.session.get("auth");
      const phone = localAuth?.phone ? normalizePhone(localAuth.phone) : null;

      // Ensure a row exists in our public users table (mirrors auth.users)
      const { error: userErr } = await supabase.from("users").upsert({ id: user.id, phone });
      if (userErr) throw userErr;

      // Generate the farm's id ourselves rather than asking Postgres to
      // hand it back via .select() — a brand-new farm has no farm_users row
      // yet, so it isn't visible under the farms SELECT policy for that
      // split second, and requesting it back (RETURNING) would fail RLS.
      // The farm_users insert right after this is what makes it visible.
      const newFarmId = crypto.randomUUID();
      const { error: farmErr } = await supabase.from("farms").insert({ id: newFarmId, name, location, currency });
      if (farmErr) throw farmErr;

      const { error: memberErr } = await supabase.from("farm_users").insert({
        farm_id: newFarmId,
        user_id: user.id,
        role: "admin",
        status: "active",
      });
      if (memberErr) throw memberErr;

      await cacheFarmContext(newFarmId, "admin", name);
      router.push("/manager");
    } catch (err) {
      setError(err.message || "Could not create farm.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-green-800 mb-1">Welcome 👋</h1>
        <p className="text-neutral-500 text-sm mb-6">Let's set up your farm. This takes one minute.</p>

        <form onSubmit={handleCreateFarm} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Farm name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kamau Dairy Farm"
              className="w-full border rounded-xl p-4 text-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Limuru, Kiambu County"
              className="w-full border rounded-xl p-4 text-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full border rounded-xl p-4 text-lg"
            >
              <option value="KES">KES — Kenyan Shilling</option>
              <option value="UGX">UGX — Ugandan Shilling</option>
              <option value="TZS">TZS — Tanzanian Shilling</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <button disabled={loading} className="w-full bg-green-700 text-white rounded-xl p-4 text-lg font-semibold">
            {loading ? "Creating…" : "Create farm"}
          </button>
          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
        </form>

        <p className="text-xs text-neutral-400 text-center mt-6">
          You can invite workers and vets from the Manager dashboard after this.
        </p>
      </div>
    </main>
  );
}
