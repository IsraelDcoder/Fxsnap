import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (client) return client;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabasePublicKey) {
    throw new Error(
      'Supabase realtime is not configured for the app. Set EXPO_PUBLIC_SUPABASE_URL and either EXPO_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env.local, then restart Expo.',
    );
  }

  client = createClient(supabaseUrl, supabasePublicKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export function hasSupabaseConfiguration() {
  return Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()
    && (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()
      || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()));
}
