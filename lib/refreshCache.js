import { db } from './db';
import { supabase } from './supabaseClient';
import { getFarmContext } from './auth';

export async function refreshLocalCache() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const ctx = await getFarmContext();
  if (!ctx) return;

  const { farm_id } = ctx;

  const [{ data: animals }, { data: feedTypes }, { data: diagnoses }] = await Promise.all([
    supabase.from('animals').select('*').eq('farm_id', farm_id),
    supabase.from('feed_types').select('*').eq('farm_id', farm_id),
    supabase.from('diagnosis_catalogue').select('*'),
  ]);

  if (animals) await db.animals.bulkPut(animals);
  if (feedTypes) await db.feed_types.bulkPut(feedTypes);
  if (diagnoses) await db.diagnosis_catalogue.bulkPut(diagnoses);
}
