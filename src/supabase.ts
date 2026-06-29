import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const fallbackSupabaseUrl = 'https://example.supabase.co';
const fallbackPublishableKey = 'missing-supabase-publishable-key';

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function assertSupabaseConfig() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase URL과 publishable key를 .env에 설정해주세요.');
  }
}

export const supabase = createClient(
  supabaseUrl ?? fallbackSupabaseUrl,
  supabasePublishableKey ?? fallbackPublishableKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  }
);
