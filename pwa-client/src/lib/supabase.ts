import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase PWA] Supabase URL or Anon Key is missing in .env config.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
