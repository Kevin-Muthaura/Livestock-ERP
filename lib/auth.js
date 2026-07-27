import { supabase } from './supabaseClient';
import { db } from './db';

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Supabase Auth needs an email-shaped identifier. Farm workers only have
// phone numbers and no SMS/email provider is used at all, so we derive a
// private, stable pseudo-email from the phone number. Nothing is ever
// actually sent to it — Supabase just treats it as the account's unique
// login identifier, with the PIN as the password.
export function normalizePhone(phone) {
  return phone.replace(/[^\d]/g, ''); // digits only, e.g. 254712345678
}
function pseudoEmail(phone) {
  return `${normalizePhone(phone)}@livestock-erp.local`;
}

/** First time this phone number is used anywhere: creates the account. Needs network, once. */
export async function createAccount(phone, pin) {
  const email = pseudoEmail(phone);
  const { data, error } = await supabase.auth.signUp({ email, password: pin });
  if (error) throw error;

  if (data.session) return data.session;

  // If the Supabase project still has "Confirm email" turned on, signUp()
  // won't return a session yet. Give a clear, actionable error rather than
  // a confusing blank failure — the setup guide has you turn this off.
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password: pin });
  if (signInError) {
    throw new Error(
      'Account created, but this Supabase project still requires email confirmation. Turn off "Confirm email" under Supabase → Authentication → Providers → Email, then try again.'
    );
  }
  return signInData.session;
}

/** Returning to sign in on a new/other device for an existing account. Needs network, once per device. */
export async function signIn(phone, pin) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: pseudoEmail(phone),
    password: pin,
  });
  if (error) throw new Error('Phone number or PIN not recognized.');
  return data.session;
}

/** After createAccount/signIn succeeds once, cache the PIN locally so this device works fully offline afterwards. */
export async function cachePinLocally(userId, phone, pin) {
  const pin_hash = await sha256(pin);
  await db.session.put({ key: 'auth', user_id: userId, phone, pin_hash });
}

/** Used on every subsequent app open on this device: works with ZERO network. */
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
