import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const APP_SUPABASE_URL = 'https://olyvjnqmrzkziirzbmhi.supabase.co';

export function appAdminClient(): SupabaseClient<Database> {
  const key = process.env['PERDCOMP_SUPABASE_SERVICE_ROLE_KEY'];
  if (!key) {
    throw new Error('PERDCOMP_SUPABASE_SERVICE_ROLE_KEY não configurada.');
  }
  return createClient<Database>(APP_SUPABASE_URL, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
