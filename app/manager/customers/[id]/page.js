"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getFarmContext } from "@/lib/auth";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const [farm, setFarm] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [statement, setStatement] = useState([]);
  const [balance, setBalance] = useState(0);
  const [tab, setTab] = useState("delivery");
  const [litres, setLitres] = useState(10);
  const [unitPrice, setUnitPrice] = useState(50);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFarmContext().then((ctx) => {
      if (!ctx) return;
      setFarm(ctx);
      load(ctx.farm_id);
    });
  }, [id]);

  async function load(farm_id) {
    setLoading(true);
    const [{ data: cust }, { data: bal }, { data: deliveries }, { data: payments }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase.from("customer_balances").select("*").eq("customer_id", id).maybeSingle(),
      supabase.from("milk_deliveries").select("*").eq("customer_id", id).order("date", { ascending: true }),
      supabase.from("customer_payments").select("*").eq("customer_id", id).order("date", { ascending: true }),
    ]);

    setCustomer(cust);
    setBalance(bal?.balance || 0);

    const combined = [
      ...(deliveries || []).map((d) => ({
        kind: "delivery",
        date: d.date,
        detail: `${d.quantity_litres} L @ ${farm?.currency || ""} ${d.unit_price}`,
        amount: Number(d.amount),
      })),
      ...(payments || []).map((p) => ({
        kind: "payment",
        date: p.date,
        detail: `Payment (${p.method})${p.notes ? " — " + p.notes : ""}`,
        amount: -Number(p.amount),
      })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = 0;
    const withRunning = combined.map((row) => {
      running += row.amount;
      return { ...row, running };
    });

    setStatement(withRunning.reverse()); // most recent first
    setLoading(false);
  }

  async function handleAddDelivery(e) {
    e.preventDefault();
    await supabase.from("milk_deliveries").insert({
      farm_id: farm.farm_id,
      customer_id: id,
      quantity_litres: litres,
      unit_price: unitPrice,
    });
    load(farm.farm_id);
  }

  async function handleAddPayment(e) {
    e.preventDefault();
    if (!paymentAmount) return;
    await supabase.from("customer_payments").insert({
      farm_id: farm.farm_id,
      customer_id: id,
      amount: Number(paymentAmount),
      method: paymentMethod,
    });
    setPaymentAmount("");
    load(farm.farm_id);
  }

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-indigo-800">{customer?.name || "Customer"}</h1>
        <Link href="/manager/customers" className="text-sm text-neutral-400 underline">
          ← Customers
        </Link>
      </div>

      <div className={`rounded-xl p-4 mb-6 border ${balance > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
        <p className="text-sm text-neutral-600">Outstanding balance</p>
        <p className={`text-2xl font-bold ${balance > 0 ? "text-red-700" : "text-green-700"}`}>
          {farm?.currency} {Math.round(balance).toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setTab("delivery")}
          className={`rounded-xl p-3 font-semibold ${tab === "delivery" ? "bg-blue-700 text-white" : "bg-neutral-100"}`}
        >
          🥛 Record delivery
        </button>
        <button
          onClick={() => setTab("payment")}
          className={`rounded-xl p-3 font-semibold ${tab === "payment" ? "bg-green-700 text-white" : "bg-neutral-100"}`}
        >
          💵 Record payment
        </button>
      </div>

      {tab === "delivery" && (
        <form onSubmit={handleAddDelivery} className="bg-white border rounded-xl p-4 space-y-3 mb-6">
          <label className="block text-sm font-medium">Litres delivered</label>
          <input
            type="number"
            step="0.5"
            required
            value={litres}
            onChange={(e) => setLitres(Number(e.target.value))}
            className="w-full border rounded-xl p-3 text-lg"
          />
          <label className="block text-sm font-medium">Price per litre ({farm?.currency})</label>
          <input
            type="number"
            step="0.5"
            required
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            className="w-full border rounded-xl p-3 text-lg"
          />
          <p className="text-sm text-neutral-500">
            Total: {farm?.currency} {(litres * unitPrice).toLocaleString()}
          </p>
          <button className="w-full bg-blue-700 text-white rounded-xl p-3 font-semibold">Save delivery</button>
        </form>
      )}

      {tab === "payment" && (
        <form onSubmit={handleAddPayment} className="bg-white border rounded-xl p-4 space-y-3 mb-6">
          <label className="block text-sm font-medium">Amount received ({farm?.currency})</label>
          <input
            type="number"
            required
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            className="w-full border rounded-xl p-3 text-lg"
          />
          <label className="block text-sm font-medium">Method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full border rounded-xl p-3">
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="bank">Bank</option>
            <option value="other">Other</option>
          </select>
          <button className="w-full bg-green-700 text-white rounded-xl p-3 font-semibold">Save payment</button>
        </form>
      )}

      <h2 className="font-semibold mb-2">Statement</h2>
      {loading && <p className="text-neutral-400">Loading…</p>}
      <div className="space-y-2">
        {statement.map((row, i) => (
          <div key={i} className="bg-white border rounded-xl p-3 flex items-center justify-between text-sm">
            <div>
              <p className="font-medium">{row.detail}</p>
              <p className="text-xs text-neutral-400">{row.date}</p>
            </div>
            <div className="text-right">
              <p className={row.amount >= 0 ? "text-blue-700" : "text-green-700"}>
                {row.amount >= 0 ? "+" : ""}
                {farm?.currency} {Math.round(row.amount).toLocaleString()}
              </p>
              <p className="text-xs text-neutral-400">Bal: {Math.round(row.running).toLocaleString()}</p>
            </div>
          </div>
        ))}
        {!loading && statement.length === 0 && (
          <p className="text-neutral-400 text-center py-8">No deliveries or payments recorded yet.</p>
        )}
      </div>
    </main>
  );
}
