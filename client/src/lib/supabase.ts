import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: SupabaseClient;

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMessage =
    "❌ Supabase configuration missing!\n\n" +
    "Please ensure the following environment variables are set in your .env file:\n" +
    "  - VITE_SUPABASE_URL\n" +
    "  - VITE_SUPABASE_ANON_KEY\n\n" +
    "After adding them, restart the Vite dev server (stop and run 'npm run client:dev' again).";
  
  console.error(errorMessage);
  
  // Create a mock client that throws helpful errors when used
  supabase = new Proxy({} as SupabaseClient, {
    get() {
      throw new Error(errorMessage);
    },
  });
} else {
  // Create Supabase client with proper configuration
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export { supabase };
