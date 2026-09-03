import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Only ever sees the publishable key, which is
// safe to ship to the client -- row-level security is what protects the data.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
