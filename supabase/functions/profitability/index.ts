// Supabase Edge Function — /functions/v1/profitability
// Computes per-animal and per-farm profit for a date range.
// Deploy with: supabase functions deploy profitability
// (Phase 2 — the manager dashboard in the MVP already computes a simpler
// farm-level version of this client-side; this function is the version
// referenced in Section G of the architecture doc, for when you want the
// heavier per-animal breakdown computed server-side.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { farm_id, from, to } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: costs } = await supabase
    .from("costs")
    .select("amount, animal_id")
    .eq("farm_id", farm_id)
    .gte("date", from)
    .lte("date", to);

  const { data: revenues } = await supabase
    .from("revenues")
    .select("amount")
    .eq("farm_id", farm_id)
    .gte("date", from)
    .lte("date", to);

  const { data: milkRevenueByAnimal } = await supabase
    .from("milk_records")
    .select("animal_id, yield_litres")
    .eq("farm_id", farm_id)
    .gte("session_date", from)
    .lte("session_date", to);

  const totalCost = (costs || []).reduce((s, c) => s + Number(c.amount), 0);
  const totalRevenue = (revenues || []).reduce((s, r) => s + Number(r.amount), 0);

  const perAnimal: Record<string, { cost: number; litres: number }> = {};
  (costs || []).forEach((c) => {
    if (!c.animal_id) return;
    perAnimal[c.animal_id] = perAnimal[c.animal_id] || { cost: 0, litres: 0 };
    perAnimal[c.animal_id].cost += Number(c.amount);
  });
  (milkRevenueByAnimal || []).forEach((m) => {
    if (!m.animal_id) return;
    perAnimal[m.animal_id] = perAnimal[m.animal_id] || { cost: 0, litres: 0 };
    perAnimal[m.animal_id].litres += Number(m.yield_litres);
  });

  const totalLitres = Object.values(perAnimal).reduce((s, a) => s + a.litres, 0) || 1;
  const milkRevenueTotal = (revenues || [])
    .filter((r: any) => r.type === "milk_sale")
    .reduce((s, r) => s + Number(r.amount), 0);

  const per_animal = Object.entries(perAnimal).map(([animal_id, v]) => {
    const allocatedRevenue = milkRevenueTotal * (v.litres / totalLitres);
    return {
      animal_id,
      revenue: Math.round(allocatedRevenue),
      cost: Math.round(v.cost),
      profit: Math.round(allocatedRevenue - v.cost),
    };
  });

  return new Response(
    JSON.stringify({
      farm_id,
      period: `${from} to ${to}`,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      profit: totalRevenue - totalCost,
      per_animal,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
