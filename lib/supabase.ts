import { createClient } from '@supabase/supabase-js';

// Fallback values allow the build to succeed without env vars set.
// At runtime, real values from NEXT_PUBLIC_SUPABASE_* must be provided.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL      ?? 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
);
