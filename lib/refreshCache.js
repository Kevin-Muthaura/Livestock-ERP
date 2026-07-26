import { db } from './db';
import { supabase } from './supabaseClient';
import { getFarmContext } from './auth';

export async function refreshLocalCache() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const ctx = await getFarmContext();
  if (!ctx) return;

  const { farm_id } = ctx;

  const [{ data: animals }, { data: feedTypes }, { data: diagnoses }, { data: breeding }] = await Promise.all([
    supabase.from('animals').select('*').eq('farm_id', farm_id),
    supabase.from('feed_types').select('*').eq('farm_id', farm_id),
    supabase.from('diagnosis_catalogue').select('*'),
    supabase.from('breeding_records').select('*').eq('farm_id', farm_id).is('actual_calving_date', null),
  ]);

  if (animals) await db.animals.bulkPut(animals);
  if (feedTypes) await db.feed_types.bulkPut(feedTypes);
  if (diagnoses) await db.diagnosis_catalogue.bulkPut(diagnoses);
  if (breeding) await db.breeding_records.bulkPut(breeding);
}

/** Finds the most recent still-open (not yet calved) breeding record for an animal, from the local cache. */
export async function getOpenBreedingRecord(animal_id) {
  const records = await db.breeding_records
    .where('animal_id')
    .equals(animal_id)
    .filter((r) => !r.actual_calving_date)
    .toArray();
  records.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return records[0] || null;
}
