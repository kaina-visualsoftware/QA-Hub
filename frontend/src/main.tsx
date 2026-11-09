import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider } from "./features/auth/AuthProvider";
import { router } from "./app/router";
import "./styles.css";
import {ToastCenter,notify} from "./components/ui/Toasts";

// When an open tab requests a chunk removed by a newer deployment,
// keep its workspace visible and ask for a controlled refresh.
window.addEventListener("vite:preloadError",event=>{
  event.preventDefault();
  notify.warning("Uma versão nova do QA Hub está disponível. Atualize a página para continuar usando esta ferramenta.");
});

const root = document.getElementById("root");
if (!root) throw Error("Elemento #root não encontrado.");
const reportFailure=(reason:unknown)=>{
  if(reason instanceof Error && reason.name==="AbortError")return;
  notify.error(reason instanceof Error?reason.message:"Não foi possível concluir a operação.");
};
const client = new QueryClient({
  queryCache:new QueryCache({onError:reportFailure}),
  mutationCache:new MutationCache({onError:reportFailure}),
  defaultOptions: { queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false } }
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <AuthProvider><RouterProvider router={router} /></AuthProvider>
      <ToastCenter/>
    </QueryClientProvider>
  </StrictMode>
);
