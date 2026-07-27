import { db, TIER } from './db';
import { supabase } from './supabaseClient';
import { getFarmContext } from './auth';

/**
 * Runs the server-side generate_notifications() function (scans breeding,
 * health, inventory, and finance conditions) and pulls the resulting rows
 * into the local cache. Safe to call often — it's a no-op read/upsert on
 * both ends when nothing has changed. Silently skipped when offline.
 */
export async function refreshNotifications() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const ctx = await getFarmContext();
  if (!ctx) return;

  await supabase.rpc('generate_notifications', { p_farm_id: ctx.farm_id }).catch((err) => {
    console.warn('generate_notifications failed (will retry next refresh):', err.message);
  });

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('farm_id', ctx.farm_id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (!error && data) {
    await db.notifications.bulkPut(data);
  }
}

/** Offline-capable: flips read_status locally right away, queues the server update for later. */
export async function markNotificationRead(id) {
  const read_at = new Date().toISOString();
  const existing = await db.notifications.get(id);
  if (existing) {
    await db.notifications.put({ ...existing, read_status: true, read_at });
  }

  await db.pending_writes.add({
    table: 'notifications',
    tier: TIER.REFERENCE,
    payload: { id, read_status: true, read_at },
    synced: 0,
    client_uuid: null,
    created_at: Date.now(),
  });
}

export async function markAllRead(ids) {
  await Promise.all(ids.map((id) => markNotificationRead(id)));
}

export const NOTIFICATION_PRIORITY = { alert: 0, reminder: 1, warning: 2 };
