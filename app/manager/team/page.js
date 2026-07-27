"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getFarmContext, normalizePhone } from "@/lib/auth";

export default function TeamPage() {
  const [farm, setFarm] = useState(null);
  const [team, setTeam] = useState([]);
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("worker");
  const [message, setMessage] = useState("");

  useEffect(() => {
    getFarmContext().then(async (ctx) => {
      if (!ctx) return;
      setFarm(ctx);
      loadTeam(ctx.farm_id);
    });
  }, []);

  async function loadTeam(farm_id) {
    const { data } = await supabase
      .from("farm_users")
      .select("id, role, status, users(phone, name)")
      .eq("farm_id", farm_id);
    setTeam(data || []);
  }

  async function handleInvite(e) {
    e.preventDefault();
    setMessage("");
    try {
      // Find or create a placeholder user row by phone (they complete account creation on their own device first)
      let { data: existing } = await supabase.from("users").select("id").eq("phone", normalizePhone(phone)).maybeSingle();
      let userId = existing?.id;

      if (!userId) {
        setMessage(
          "This phone hasn't signed in yet. Ask them to open the app and sign in with this exact phone number first, then invite them here."
        );
        return;
      }

      await supabase.from("farm_users").insert({
        farm_id: farm.farm_id,
        user_id: userId,
        role,
        status: "active",
      });
      setPhone("");
      setMessage("Added ✓");
      loadTeam(farm.farm_id);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <main className="flex-1 p-6 max-w-sm mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-purple-800">👥 Team</h1>
        <Link href="/manager" className="text-sm text-neutral-400 underline">
          ← Dashboard
        </Link>
      </div>

      <form onSubmit={handleInvite} className="space-y-3 mb-6 bg-white border rounded-xl p-4">
        <p className="text-sm font-medium">Add a team member</p>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+254 7XX XXX XXX"
          className="w-full border rounded-xl p-3"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border rounded-xl p-3">
          <option value="worker">Worker</option>
          <option value="manager">Manager</option>
          <option value="vet">Vet</option>
          <option value="accountant">Accountant</option>
        </select>
        <button className="w-full bg-purple-700 text-white rounded-xl p-3 font-semibold">Add</button>
        {message && <p className="text-sm text-neutral-600">{message}</p>}
      </form>

      <h2 className="font-semibold mb-2">Current team</h2>
      <div className="space-y-2">
        {team.map((m) => (
          <div key={m.id} className="bg-white border rounded-xl p-3 flex justify-between text-sm">
            <span>{m.users?.name || m.users?.phone}</span>
            <span className="text-neutral-500">{m.role} · {m.status}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
