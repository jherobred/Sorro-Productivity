import { createClient } from '@supabase/supabase-js';

// Publishable key is safe in the client — RLS is what protects the data.
// Every bd_* table has user_id = auth.uid() policies; see the basedly_v1_schema migration.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      // PKCE is required for the Capacitor shell: the OAuth round-trip leaves
      // the webview and comes back through a deep link, so there is no
      // server to hold a code verifier.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not signed in');
  return data.user.id;
}
