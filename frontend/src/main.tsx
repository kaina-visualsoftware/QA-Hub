import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider } from "./features/auth/AuthProvider";
import { router } from "./app/router";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw Error("Elemento #root não encontrado.");
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false } }
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <AuthProvider><RouterProvider router={router} /></AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
