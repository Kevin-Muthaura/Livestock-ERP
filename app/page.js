"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAccount,
  signIn,
  cachePinLocally,
  unlockWithPin,
  cacheFarmContext,
  getFarmContext,
} from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

const STEP = {
  CHECK: "check",
  AUTH: "auth", // no local session yet — create account or sign in with phone + PIN
  PIN: "pin", // local session cached — just unlock with PIN, works offline
};

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState(STEP.CHECK);
  const [mode, setMode] = useState("create"); // 'create' | 'signin'
  const [phone, setPhone] = useState("");
  const [pin, setPinValue] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const ctx = await getFarmContext();
      setStep(ctx ? STEP.PIN : STEP.AUTH);
    })();
  }, []);

  async function routeAfterLogin() {
    const ctx = await getFarmContext();
    if (!ctx) {
      router.push("/onboarding");
      return;
    }
    router.push(ctx.role === "worker" ? "/worker" : "/manager");
  }

  async function afterAuthSuccess(session) {
    await cachePinLocally(session.user.id, phone, pin);

    // check whether this phone already belongs to a farm
    const { data: memberships } = await supabase
      .from("farm_users")
      .select("farm_id, role, status, farms(name)")
      .eq("user_id", session.user.id)
      .eq("status", "active")
      .limit(1);

    if (memberships && memberships.length > 0) {
      const m = memberships[0];
      await cacheFarmContext(m.farm_id, m.role, m.farms?.name);
    }
    await routeAfterLogin();
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (pin.length < 4) return setError("PIN must be at least 4 digits.");
    if (pin !== pin2) return setError("PINs don't match.");
    setLoading(true);
    try {
      const session = await createAccount(phone, pin);
      await afterAuthSuccess(session);
    } catch (err) {
      setError(err.message || "Could not create account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await signIn(phone, pin);
      await afterAuthSuccess(session);
    } catch (err) {
      setError(err.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePinUnlock(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await unlockWithPin(pin);
      if (!result.ok) {
        setError(
          result.reason === "wrong_pin"
            ? "Wrong PIN. Try again."
            : "No saved login on this device — connect to the internet once to sign in."
        );
        return;
      }
      await routeAfterLogin();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-2">🐄</div>
          <h1 className="text-2xl font-bold text-green-800">Livestock ERP</h1>
          <p className="text-neutral-500 text-sm mt-1">From Animal Birth to Milk Profit</p>
        </div>

        {step === STEP.CHECK && <p className="text-center text-neutral-400">Loading…</p>}

        {step === STEP.AUTH && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-6">
              <button
                onClick={() => setMode("create")}
                className={`rounded-xl p-3 font-semibold ${mode === "create" ? "bg-green-700 text-white" : "bg-neutral-100"}`}
              >
                New account
              </button>
              <button
                onClick={() => setMode("signin")}
                className={`rounded-xl p-3 font-semibold ${mode === "signin" ? "bg-green-700 text-white" : "bg-neutral-100"}`}
              >
                I have an account
              </button>
            </div>

            <form onSubmit={mode === "create" ? handleCreate : handleSignIn} className="space-y-4">
              <label className="block text-sm font-medium">Phone number</label>
              <input
                type="tel"
                required
                placeholder="+254 7XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border rounded-xl p-4 text-lg"
              />

              <label className="block text-sm font-medium">{mode === "create" ? "Choose a 4+ digit PIN" : "Your PIN"}</label>
              <input
                type="password"
                required
                inputMode="numeric"
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPinValue(e.target.value)}
                className="w-full border rounded-xl p-4 text-lg tracking-widest text-center"
              />

              {mode === "create" && (
                <>
                  <label className="block text-sm font-medium">Confirm PIN</label>
                  <input
                    type="password"
                    required
                    inputMode="numeric"
                    placeholder="Confirm PIN"
                    value={pin2}
                    onChange={(e) => setPin2(e.target.value)}
                    className="w-full border rounded-xl p-4 text-lg tracking-widest text-center"
                  />
                </>
              )}

              <button disabled={loading} className="w-full bg-green-700 text-white rounded-xl p-4 text-lg font-semibold">
                {loading ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"}
              </button>
              <p className="text-xs text-neutral-400 text-center">
                This needs internet once. After that, this device works offline with your PIN.
              </p>
            </form>
          </>
        )}

        {step === STEP.PIN && (
          <form onSubmit={handlePinUnlock} className="space-y-4">
            <label className="block text-sm font-medium text-center">Enter your PIN</label>
            <input
              type="password"
              required
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPinValue(e.target.value)}
              className="w-full border rounded-xl p-4 text-2xl tracking-[0.5em] text-center"
            />
            <button disabled={loading} className="w-full bg-green-700 text-white rounded-xl p-4 text-lg font-semibold">
              {loading ? "Checking…" : "Unlock"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setStep(STEP.AUTH);
              }}
              className="w-full text-sm text-neutral-500 underline"
            >
              Not your device? Sign in with phone number
            </button>
          </form>
        )}

        {error && <p className="text-red-600 text-sm text-center mt-4">{error}</p>}
      </div>
    </main>
  );
}
