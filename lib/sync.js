import { db } from './db';
import { supabase } from './supabaseClient';

let syncing = false;

/**
 * Flushes queued offline writes to Supabase, tier by tier:
 *   Tier 1: costs, revenues, health_records  (financial + medical — most important, smallest volume)
 *   Tier 2: milk_records                     (highest volume, still important)
 *   Tier 3: photos / reference data          (largest payload, least time-sensitive)
 * This mirrors Section F.3 of the architecture doc.
 */
export async function flushPendingWrites() {
  if (syncing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  syncing = true;

  try {
    const pending = await db.pending_writes.where('synced').equals(0).sortBy('tier');

    for (const item of pending) {
      try {
        const { table, payload } = item;
        // upsert on client_uuid avoids duplicate rows if a write is retried
        const { error } = await supabase.from(table).upsert(payload, {
          onConflict: 'client_uuid',
        });

        if (!error) {
          await db.pending_writes.update(item.id, { synced: 1 });
        } else {
          console.error(`Sync failed for ${table}:`, error.message);
          // leave it queued; will retry on next flush
        }
      } catch (err) {
        console.error('Sync item failed, will retry:', err);
      }
    }
  } finally {
    syncing = false;
  }
}

/** Count of records still waiting to sync — drives the "X pending" badge in the UI. */
export async function pendingCount() {
  return db.pending_writes.where('synced').equals(0).count();
}

/** Call once from the root layout to start background sync behavior. */
export function initSyncEngine() {
  if (typeof window === 'undefined') return;

  flushPendingWrites();
  window.addEventListener('online', flushPendingWrites);

  // Retry periodically in case 'online' event doesn't fire reliably on flaky rural networks
  setInterval(flushPendingWrites, 30000);
}
