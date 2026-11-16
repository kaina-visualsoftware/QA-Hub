import {Link} from "@tanstack/react-router";
import {BookOpenText, ExternalLink, ListChecks} from "lucide-react";
import {BrandLogo} from "../../components/ui/BrandLogo";
import "./public.css";

/** One navigation and layout for all public QA Hub libraries. */
export function PublicHeader({current}:{current:"tfs"|"documentacoes"}) {
 return <header className="public-react-header">
  <Link to="/publicas" search={{}} className="brand">
   <BrandLogo/>
   <span><strong>QA Hub</strong><small>BIBLIOTECA PÚBLICA</small></span>
  </Link>
  <nav className="qa-public-header-links" aria-label="Bibliotecas públicas">
   <Link to="/publicas" search={{}}
    className={"secondary-link"+(current==="tfs"?" is-active":"")}
    aria-current={current==="tfs"?"page":undefined}>
    <ListChecks size={16} aria-hidden="true"/> TFs públicas
   </Link>
   <Link to="/documentacoes" search={{view:"public"}}
    className={"secondary-link"+(current==="documentacoes"?" is-active":"")}
    aria-current={current==="documentacoes"?"page":undefined}>
    <BookOpenText size={16} aria-hidden="true"/> Documentações públicas
   </Link>
   <Link to="/" className="secondary-link qa-public-login">
    <ExternalLink size={16} aria-hidden="true"/> Entrar no QA Hub
   </Link>
  </nav>
 </header>;
}
