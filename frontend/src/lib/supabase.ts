import { createClient } from "@supabase/supabase-js";

// Publishable keys identify the public client; row authorization remains in Supabase RLS.
// These defaults match the existing public qa-config.js and do not grant privileged access.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://pqadmlhcsimlcclpkyov.supabase.co";
export const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_3Duz2dETsyYNPtfY-8Mxjw_pGBvCUP9";

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export const authRedirectUrl =
  import.meta.env.VITE_AUTH_REDIRECT_URL ||
  "https://kaina-visualsoftware.github.io/QA-Hub/qa.html";

export const qaGeneratorUrl = supabaseUrl.replace(/\/$/, "") + "/functions/v1/qa-generators";
