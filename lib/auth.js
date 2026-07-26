import { supabase } from './supabaseClient';
import { db } from './db';

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Step 1 (needs network, one time): request an SMS OTP code. */
export async function requestOtp(phone) {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

/** Step 2 (needs network, one time): verify the code the worker received by SMS. */
export async function verifyOtp(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data.session;
}

/** Step 3 (needs network, one time): set a local PIN so the device works offline afterwards. */
export async function setPin(userId, phone, pin) {
  const pin_hash = await sha256(pin);
  await supabase.from('users').update({ pin_hash }).eq('id', userId);
  await db.session.put({ key: 'auth', user_id: userId, phone, pin_hash });
}

/** Used on every app open after the first time: works with ZERO network. */
export async function unlockWithPin(pin) {
  const local = await db.session.get('auth');
  if (!local) return { ok: false, reason: 'no_local_session' };

  const attempt_hash = await sha256(pin);
  if (attempt_hash !== local.pin_hash) {
    return { ok: false, reason: 'wrong_pin' };
  }
  return { ok: true, user_id: local.user_id, phone: local.phone };
}

/** Cache which farm + role this device belongs to, so worker/manager routing works offline. */
export async function cacheFarmContext(farm_id, role, farm_name) {
  await db.session.put({ key: 'farm_context', farm_id, role, farm_name });
}

export async function getFarmContext() {
  return db.session.get('farm_context');
}

export async function signOutLocal() {
  await supabase.auth.signOut().catch(() => {});
  await db.session.clear();
}
