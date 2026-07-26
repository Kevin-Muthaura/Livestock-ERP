"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getFarmContext } from "@/lib/auth";

export default function CustomersPage() {
  const [farm, setFarm] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("processor");

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) return;
      setFarm(ctx);
      load(ctx.farm_id);
    });
  }, []);

  async function load(farm_id) {
    setLoading(true);
    const { data } = await supabase
      .from("customer_balances")
      .select("*")
      .eq("farm_id", farm_id)
      .order("balance", { ascending: false });
    setCustomers(data || []);
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!name) return;
    await supabase.from("customers").insert({ farm_id: farm.farm_id, name, phone, type });
    setName("");
    setPhone("");
    setShowForm(false);
    load(farm.farm_id);
  }

  const totalOutstanding = customers.reduce((s, c) => s + Number(c.balance), 0);

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-indigo-800">🧾 Customers</h1>
        <Link href="/manager" className="text-sm text-neutral-400 underline">
          ← Dashboard
        </Link>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-indigo-800">Total outstanding across all customers</p>
        <p className="text-2xl font-bold text-indigo-900">
          {farm?.currency} {Math.round(totalOutstanding).toLocaleString()}
        </p>
      </div>

      <button
        onClick={() => setShowForm((s) => !s)}
        className="w-full bg-indigo-700 text-white rounded-xl p-3 font-semibold mb-4"
      >
        {showForm ? "Cancel" : "+ Add customer"}
      </button>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border rounded-xl p-4 space-y-3 mb-6">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customer / buyer name"
            className="w-full border rounded-xl p-3"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="w-full border rounded-xl p-3"
          />
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border rounded-xl p-3">
            <option value="processor">Processor (e.g. dairy cooperative)</option>
            <option value="retailer">Retailer / shop</option>
            <option value="individual">Individual buyer</option>
          </select>
          <button className="w-full bg-indigo-700 text-white rounded-xl p-3 font-semibold">Save</button>
        </form>
      )}

      {loading && <p className="text-neutral-400">Loading…</p>}

      <div className="space-y-2">
        {customers.map((c) => (
          <Link
            key={c.customer_id}
            href={`/manager/customers/${c.customer_id}`}
            className="bg-white border rounded-xl p-4 flex items-center justify-between block"
          >
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-neutral-500">{c.phone || "No phone"} · {c.type}</p>
            </div>
            <span className={`font-bold ${c.balance > 0 ? "text-red-600" : "text-green-700"}`}>
              {farm?.currency} {Math.round(c.balance).toLocaleString()}
            </span>
          </Link>
        ))}
        {!loading && customers.length === 0 && (
          <p className="text-neutral-400 text-center py-8">No customers yet — add your first milk buyer above.</p>
        )}
      </div>
    </main>
  );
}
