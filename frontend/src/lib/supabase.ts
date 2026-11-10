import { createClient } from "@supabase/supabase-js";
import { resolveAuthRedirectUrl } from "./auth-redirect";

// Publishable keys identify the public client; row authorization remains in Supabase RLS.
// These defaults match the existing public qa-config.js and do not grant privileged access.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://pqadmlhcsimlcclpkyov.supabase.co";
export const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_3Duz2dETsyYNPtfY-8Mxjw_pGBvCUP9";

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// Sign-up and recovery always use the dedicated React auth callback in production.
 // A stale localhost override must never leak into links emailed to users.
export const authRedirectUrl = resolveAuthRedirectUrl({
  production: import.meta.env.PROD,
  baseUrl: import.meta.env.BASE_URL,
  origin: typeof window === "undefined" ? undefined : window.location.origin,
  configuredUrl: import.meta.env.VITE_AUTH_REDIRECT_URL
});

export const qaGeneratorUrl = supabaseUrl.replace(/\/$/, "") + "/functions/v1/qa-generators";
