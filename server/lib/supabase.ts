/**
 * Supabase Client Helper
 * Centralized Supabase client creation
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️  Supabase URL or Anon Key not set. Supabase features will be disabled.");
}

/**
 * Get Supabase client for client-side operations
 * Uses anon key - respects Row Level Security policies
 */
export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and Anon Key must be set");
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Get Supabase admin client for server-side admin operations
 * Uses service role key - bypasses Row Level Security
 * WARNING: Only use on server-side, never expose to client
 */
export function getSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase URL and Service Role Key must be set");
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}

