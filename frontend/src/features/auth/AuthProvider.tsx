import {
  createContext, useContext, useEffect, useMemo, useRef, useState
} from "react";
import type { PropsWithChildren } from "react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@heroui/react";
import { ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, authRedirectUrl } from "../../lib/supabase";
import { useFocus } from "../../stores/focus";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  recovering: boolean;
  endRecovery: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw Error("AuthProvider ausente.");
  return state;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const setFocusUser = useFocus((s) => s.setUser);
  // Session-sensitive query cache is cleared when account identity changes.
  const previousUserId = useRef<string | null>(null);
  const client = useQueryClient();

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const id = user?.id ?? null;
    if (previousUserId.current && previousUserId.current !== id) {
      client.clear();
    }
    previousUserId.current = id;
    setFocusUser(id);
  }, [user?.id, setFocusUser, client]);

  const value = useMemo(() => ({
    user, loading, recovering, endRecovery: () => {
      setRecovering(false);
      if (window.location.hash.startsWith("#/recuperar")) {
        window.location.hash = "#/";
      }
    }
  }), [user, loading, recovering]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function RecoveryScreen() {
  const { endRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setPassword("");
    endRecovery();
  }
  return <div className="auth-page"><section className="auth-card">
    <h1 className="text-2xl font-bold">Definir nova senha</h1>
    <p className="text-muted mt-2">Atualize a senha da conta autenticada.</p>
    <label className="field mt-5">Nova senha
      <input type="password" minLength={8} value={password}
        autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
    </label>
    <Button className="mt-4" isDisabled={busy || password.length < 8} onPress={() => void save()}>
      Atualizar senha
    </Button>
    {message && <p role="alert" className="text-error mt-3">{message}</p>}
  </section></div>;
}

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const callbackError = location.hash.startsWith("#error=")
    ? new URLSearchParams(location.hash.slice(1)).get("error_code") : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authRedirectUrl
        });
        if (e) throw e;
        setMessage("Se a conta existir, você receberá um link de recuperação.");
      } else if (mode === "signup") {
        const { data, error: e } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: authRedirectUrl }
        });
        if (e) throw e;
        if (!data.session) setMessage("Verifique seu email para confirmar o cadastro.");
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      }
      setPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha de autenticação."); }
    finally { setBusy(false); }
  }

  return <div className="auth-page">
    <div className="auth-intro">
      <span className="eyebrow">QA HUB / WORKSPACE</span>
      <div className="logo-mark" aria-hidden="true">Q<span>.</span></div>
      <h1>Menos formulários.<br /><span>Mais testes.</span></h1>
      <p>Uma TF em foco, cenários à mão e resultados reais registrados sem perder tempo.</p>
      <div className="auth-bottom"><ShieldCheck size={20} /> Dados protegidos pelas permissões do Supabase</div>
    </div>
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">ACESSO À PLATAFORMA</p>
      <h2 id="auth-title" className="text-2xl font-bold mt-2">
        {mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha"}
      </h2>
      <p className="text-muted mt-2">Entre com sua conta do QA Hub.</p>
      <form onSubmit={(e) => void submit(e)} className="stack mt-6">
        <label className="field">Email
          <input type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" />
        </label>
        {mode !== "reset" && <label className="field">Senha
          <input type="password" required minLength={6} value={password}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            onChange={(e) => setPassword(e.target.value)} />
        </label>}
        <Button type="submit" isDisabled={busy} className="w-full mt-3">
          {busy ? "Processando…" : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
        </Button>
      </form>
      {(error || callbackError) && <p role="alert" className="notice error mt-4">
        {error || (callbackError === "otp_expired"
          ? "Link expirado ou já utilizado. Entre ou solicite novo link."
          : "Não foi possível validar o link de autenticação.")}
      </p>}
      {message && <p role="status" className="notice mt-4">{message}</p>}
      <div className="auth-links mt-5">
        <button type="button" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}>
          {mode === "signup" ? "Já tenho conta" : "Criar uma conta"}
        </button>
        <button type="button" onClick={() => { setMode(mode === "reset" ? "login" : "reset"); setError(""); }}>
          {mode === "reset" ? "Voltar ao login" : "Esqueci a senha"}
        </button>
      </div>
      <a className="subtle-link mt-6 inline-block" href="#/publicas">
        Consultar TFs públicas
      </a>
    </section>
  </div>;
}
