import Dexie from 'dexie';

// Local-first database. Every table here mirrors a Supabase table.
// Records are written here FIRST (instantly, no network needed),
// then flushed to Supabase in the background by lib/sync.js.
export const db = new Dexie('livestock_erp_local');

db.version(1).stores({
  // pending_writes is the sync queue: every offline create/update lands here
  // tagged with a tier (1 = financial/health, 2 = milk, 3 = reference/photos)
  // so lib/sync.js can flush in the right priority order (Section F.3).
  pending_writes: '++id, table, tier, synced, client_uuid, created_at',

  // Local read caches (refreshed opportunistically when online)
  animals: 'id, farm_id, tag_id, status, client_uuid',
  milk_records: 'id, farm_id, animal_id, session_date, client_uuid',
  health_records: 'id, farm_id, animal_id, event_date, client_uuid',
  feeding_logs: 'id, farm_id, animal_id, date, client_uuid',
  breeding_records: 'id, farm_id, animal_id, client_uuid, actual_calving_date',
  costs: 'id, farm_id, date, client_uuid',
  revenues: 'id, farm_id, date, client_uuid',
  customers: 'id, farm_id, client_uuid',
  invoices: 'id, farm_id, customer_id, status, client_uuid',
  notifications: 'id, farm_id, user_id, read_status, category, created_at',
  diagnosis_catalogue: 'id, name, category',
  feed_types: 'id, farm_id',
  session: 'key', // stores current farm_id, user, role, pin_hash for offline unlock
});

export const TIER = {
  FINANCIAL_HEALTH: 1,
  MILK: 2,
  REFERENCE: 3,
};

/**
 * Queue a write for sync AND write it immediately to the local read cache,
 * so the UI reflects the change instantly without waiting on the network.
 */
export async function queueWrite(table, tier, record) {
  const client_uuid = record.client_uuid || crypto.randomUUID();
  const withId = { ...record, id: record.id || client_uuid, client_uuid };

  await db.table(table).put(withId);
  await db.pending_writes.add({
    table,
    tier,
    payload: withId,
    synced: 0,
    client_uuid,
    created_at: Date.now(),
  });

  return withId;
}
