/** Public callback is a standalone page, outside the SPA hash router.
 * Never allow a production email callback to point at localhost (or a
 * different hostname): it can receive one-time auth credentials.
 */
export const QA_HUB_PUBLIC_URL = "https://kaina-visualsoftware.github.io/QA-Hub/react/";
export const QA_HUB_EMAIL_CALLBACK_URL = QA_HUB_PUBLIC_URL + "auth.html";

type AuthRedirectOptions = {
  production: boolean;
  baseUrl: string;
  origin?: string;
  configuredUrl?: string;
};

export function resolveAuthRedirectUrl({
  production, baseUrl, origin, configuredUrl
}: AuthRedirectOptions): string {
  if (production) {
    // Only the QA Hub's exact, HTTPS production callback is permitted.
    return configuredUrl?.trim() === QA_HUB_EMAIL_CALLBACK_URL
      ? configuredUrl.trim() : QA_HUB_EMAIL_CALLBACK_URL;
  }
  // During local development keep the callback on the local Vite instance.
  const localBase = new URL(baseUrl, origin ?? "http://localhost:8765");
  return new URL("auth.html", localBase).href;
}
