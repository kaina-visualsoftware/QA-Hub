import { lazy, Suspense, useEffect, useState } from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import { Button } from "@heroui/react";
import { Check, RotateCcw, Save, Settings2, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../../lib/supabase";
import {
  NAV_PREF_KEY, defaultNavigationPreferences, menuDescriptions,
  navigationFromMetadata, optionalMenuIds
} from "./navigation-preferences";
import type { NavigationPreferences, OptionalMenuId } from "./navigation-preferences";
const TeamsSettings=lazy(()=>import("../collaboration/TeamsSettings"));

export default function ProfilePage({isAdmin}: {isAdmin:boolean}){
  const {user} = useAuth();
  const [selection,setSelection] = useState<NavigationPreferences>(() =>
    navigationFromMetadata(user?.user_metadata));
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [showTeams,setShowTeams]=useState(false);
  useEffect(() => {
    setSelection(navigationFromMetadata(user?.user_metadata));
  }, [user?.id, user?.user_metadata]);

  function change(id:OptionalMenuId,value:boolean) {
    setSelection(current=>({...current,[id]:value}));
    setMessage("");setError("");
  }
  async function save(){
    if(!user||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      // Supabase Auth stores preferences in the authenticated user's metadata.
      // Do not update role, access rights or another user's record.
      const {error:failure}=await supabase.auth.updateUser({
        data: { [NAV_PREF_KEY]: selection }
      });
      if(failure)throw failure;
      setMessage("Preferências salvas na sua conta.");
    }catch(cause){
      setError(cause instanceof Error ? cause.message : "Falha ao salvar preferências.");
    }finally{setBusy(false);}
  }
  const active=optionalMenuIds.filter(id=>selection[id]&&(id!=="admin"||isAdmin));
  return <div className="page qa-profile-page">
    <div className="page-heading">
      <div><p className="eyebrow">MINHA CONTA</p><h1>Perfil e configurações</h1></div>
    </div>
    <div className="qa-profile-layout">
      <section className="panel qa-profile-identity" aria-label="Conta">
        <div className="qa-profile-avatar" aria-hidden="true">
          {(user?.email?.slice(0,1)||"Q").toUpperCase()}
        </div>
        <h2>Meu perfil</h2>
        <p className="text-muted text-sm qa-email-wrap">{user?.email||"Conta autenticada"}</p>
        <p className="qa-profile-role"><ShieldCheck size={16} aria-hidden="true"/>
          {isAdmin?"Administrador":"QA"}
        </p>
        <p className="text-muted text-sm">As preferências de menu são salvas na sua conta.
          Elas modificam a aparência da navegação, não as permissões.</p>
      </section>
      <section className="panel qa-profile-preferences" aria-label="Personalizar menu lateral">
        <div className="qa-profile-title">
          <Settings2 size={21} aria-hidden="true"/>
          <div><h2>Personalizar barra lateral</h2>
            <p className="text-muted text-sm">Escolha as áreas que devem aparecer no menu.</p>
          </div>
        </div>
        <div className="qa-profile-menu-options">
          <div className="qa-profile-menu-option">
            <div><strong>Tarefas</strong><small>TFs, cenários, testes, posts, diagramas e relatórios</small></div>
            <span className="qa-profile-fixed"><Check size={15} aria-hidden="true"/> Fixo</span>
          </div>
          {optionalMenuIds.filter(id=>id!=="admin"||isAdmin).map(id=>
            <label className="qa-profile-menu-option" key={id}>
              <span><strong>{menuDescriptions[id].label}</strong>
                <small>{menuDescriptions[id].description}</small></span>
              <input type="checkbox" checked={selection[id]} disabled={busy}
                onChange={event=>change(id,event.target.checked)}/>
            </label>
          )}
        </div>
        <p className="text-muted text-sm">
          {active.length+1} área(s) selecionada(s), além do acesso ao seu perfil.
        </p>
        <div className="qa-profile-actions">
          <Button variant="secondary" isDisabled={busy} onPress={()=>{
            setSelection({...defaultNavigationPreferences});setMessage("");setError("");
          }}><RotateCcw size={16}/> Restaurar seleção</Button>
          <Button isDisabled={busy} onPress={()=>void save()}>
            <Save size={16}/> {busy?"Salvando…":"Salvar preferências"}
          </Button>
        </div>
        <ToastNotice message={message} tone="success"/>
        <ToastNotice message={error} tone="error"/>
      </section>
    </div>
    <section className="panel qa-f5-profile-teams" aria-label="Gerenciar equipes">
      <div className="qa-profile-title">
        <Settings2 size={20} aria-hidden="true"/>
        <div><h2>Equipes e colaboração</h2>
          <p className="text-muted text-sm">Convites, permissões e integrantes.</p>
        </div>
      </div>
      <Button variant="secondary" onPress={()=>setShowTeams(value=>!value)}
        aria-expanded={showTeams}>
        {showTeams?"Fechar equipes":"Gerenciar equipes"}
      </Button>
      {showTeams&&user?.id&&<Suspense fallback={<p role="status">Carregando equipes…</p>}>
        <TeamsSettings userId={user.id}/>
      </Suspense>}
    </section>
  </div>;
}
