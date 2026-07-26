import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // This warning shows up in the browser console (not a crash) if .env.local
  // hasn't been filled in yet during setup. See SETUP_GUIDE for instructions.
  console.warn(
    '[Livestock ERP] Supabase env vars are missing. Copy .env.local.example to .env.local and fill in your project URL + anon key.'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
