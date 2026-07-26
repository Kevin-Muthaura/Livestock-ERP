"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestOtp, verifyOtp, setPin, unlockWithPin, cacheFarmContext, getFarmContext } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

const STEP = {
  CHECK: "check",
  PHONE: "phone",
  OTP: "otp",
  SET_PIN: "set_pin",
  PIN: "pin",
};

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState(STEP.CHECK);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [pin, setPinValue] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);

  useEffect(() => {
    (async () => {
      const ctx = await getFarmContext();
      if (ctx) {
        setStep(STEP.PIN);
      } else {
        setStep(STEP.PHONE);
      }
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

  async function handleSendOtp(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestOtp(phone);
      setStep(STEP.OTP);
    } catch (err) {
      setError(err.message || "Could not send code. Check your phone number and network.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await verifyOtp(phone, otp);
      setPendingUser(session.user);
      setStep(STEP.SET_PIN);
    } catch (err) {
      setError(err.message || "That code didn't work. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPin(e) {
    e.preventDefault();
    setError("");
    if (pin.length < 4) return setError("PIN must be at least 4 digits.");
    if (pin !== pin2) return setError("PINs don't match.");
    setLoading(true);
    try {
      await setPin(pendingUser.id, phone, pin);

      // check whether this phone already belongs to a farm
      const { data: memberships } = await supabase
        .from("farm_users")
        .select("farm_id, role, status, farms(name)")
        .eq("user_id", pendingUser.id)
        .eq("status", "active")
        .limit(1);

      if (memberships && memberships.length > 0) {
        const m = memberships[0];
        await cacheFarmContext(m.farm_id, m.role, m.farms?.name);
      }
      await routeAfterLogin();
    } catch (err) {
      setError(err.message || "Could not save PIN.");
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
        setError(result.reason === "wrong_pin" ? "Wrong PIN. Try again." : "No saved login on this device — connect to the internet once to sign in.");
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

        {step === STEP.PHONE && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <label className="block text-sm font-medium">Phone number</label>
            <input
              type="tel"
              required
              placeholder="+254 7XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border rounded-xl p-4 text-lg"
            />
            <button disabled={loading} className="w-full bg-green-700 text-white rounded-xl p-4 text-lg font-semibold">
              {loading ? "Sending…" : "Send code"}
            </button>
            <p className="text-xs text-neutral-400 text-center">
              First-time login needs internet, once. After that this device works offline with your PIN.
            </p>
          </form>
        )}

        {step === STEP.OTP && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <label className="block text-sm font-medium">Enter the code sent to {phone}</label>
            <input
              type="text"
              required
              inputMode="numeric"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full border rounded-xl p-4 text-lg tracking-widest text-center"
            />
            <button disabled={loading} className="w-full bg-green-700 text-white rounded-xl p-4 text-lg font-semibold">
              {loading ? "Checking…" : "Verify"}
            </button>
          </form>
        )}

        {step === STEP.SET_PIN && (
          <form onSubmit={handleSetPin} className="space-y-4">
            <label className="block text-sm font-medium">Create a 4+ digit PIN for this device</label>
            <input
              type="password"
              required
              inputMode="numeric"
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPinValue(e.target.value)}
              className="w-full border rounded-xl p-4 text-lg tracking-widest text-center"
            />
            <input
              type="password"
              required
              inputMode="numeric"
              placeholder="Confirm PIN"
              value={pin2}
              onChange={(e) => setPin2(e.target.value)}
              className="w-full border rounded-xl p-4 text-lg tracking-widest text-center"
            />
            <button disabled={loading} className="w-full bg-green-700 text-white rounded-xl p-4 text-lg font-semibold">
              {loading ? "Saving…" : "Continue"}
            </button>
            <p className="text-xs text-neutral-400 text-center">
              You'll use this PIN to open the app on this phone, even with no signal.
            </p>
          </form>
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
              onClick={() => setStep(STEP.PHONE)}
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
