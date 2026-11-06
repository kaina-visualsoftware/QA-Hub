import { supabase } from "../../lib/supabase";

// A standalone MPA callback keeps Supabase's #access_token fragment separate
// from TanStack's #/ hash router. Do not log URLs, codes or session tokens.
const status = document.getElementById("callback-status");
const returnLink = document.getElementById("callback-return");
if (!status || !returnLink) throw Error("Callback de autenticação incompleto.");
const base = import.meta.env.BASE_URL;
const home = new URL(base + "#/", window.location.origin).toString();
returnLink.setAttribute("href", home);

const query = new URLSearchParams(window.location.search);
const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const errorCode = query.get("error_code") || fragment.get("error_code") ||
  query.get("error") || fragment.get("error");
let recovery = query.get("type") === "recovery" || fragment.get("type") === "recovery";
let completed = false;

function fail() {
  status!.textContent = "O link expirou ou não pôde ser validado. Solicite outro link no QA Hub.";
}
function success() {
  if (completed) return;
  completed = true;
  status!.textContent = "Acesso confirmado. Abrindo o QA Hub…";
  // Never retain transient credentials in URL history after auth succeeds.
  window.location.replace(
    new URL(base + (recovery ? "#/recuperar" : "#/"), window.location.origin).toString()
  );
}

if (errorCode) {
  fail();
} else {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") recovery = true;
    if (session && (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY")) {
      success();
    }
  });
  void supabase.auth.getSession().then(({ data, error }) => {
    if (completed) return;
    if (!error && data.session) success();
    else fail();
  }).catch(fail).finally(() => {
    // Keep subscription only until callback finishes. The SPA creates its own.
    subscription.unsubscribe();
  });
}
