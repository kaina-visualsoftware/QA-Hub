import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const ROOT = "http://127.0.0.1:4173/QA-Hub/";
const USER = "11111111-1111-4111-8111-111111111111";
const sessionUser = {
  id: USER, email: "quick-create@fixture.invalid",
  role: "authenticated", aud: "authenticated",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {}, created_at: "2026-11-06T12:00:00.000Z"
};
const calls = { task: 0, case: 0 };
const failures = [];
const savedTasks = [];
const savedCases = [];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, prefer, accept",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};
const browser = await chromium.launch({ headless: true });
function json(route, body, status = 200) {
  return route.fulfill({
    status, headers: cors, contentType: "application/json", body: JSON.stringify(body)
  });
}
async function fakeBackend(route) {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname;
  const method = req.method();
  if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  if (path.endsWith("/auth/v1/token")) return json(route, {
    access_token: "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token: "fixture-refresh", token_type: "bearer",
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: sessionUser
  });
  if (path.endsWith("/auth/v1/user")) return json(route, sessionUser);
  if(await mockF4Rpc(route,savedTasks,savedCases))return;
  if (path.endsWith("/rest/v1/qa_admins")) return json(route, null);
  if (path.endsWith("/rest/v1/qa_tarefas")) {
    if (method === "POST") {
      const draft = req.postDataJSON();
      assert.equal(draft.user_id, USER);
      assert.equal(draft.status, "rascunho");
      calls.task++;
      const record = {
        ...draft,
        id: "33333333-3333-4333-8333-" + String(calls.task).padStart(12, "0"),
        created_at: "2026-11-06T12:00:00.000Z",
        executado_em: "2026-11-06"
      };
      savedTasks.push(record);
      return json(route, record, 201);
    }
    if (method === "GET") {
      assert.equal(url.searchParams.get("user_id"), "eq." + USER);
      return json(route, savedTasks);
    }
  }
  if (path.endsWith("/rest/v1/qa_cenarios")) {
    if (method === "GET") {
      const task = url.searchParams.get("tarefa_id")?.replace("eq.", "");
      return json(route, savedCases.filter((scenario) => scenario.tarefa_id === task));
    }
    if (method === "POST") {
      const payload = req.postDataJSON();
      const drafts = Array.isArray(payload) ? payload : [payload];
      for (const draft of drafts) {
        calls.case++;
        assert.equal(draft.user_id, USER);
        assert.equal(draft.status, "nao_executado",
          "Saving a scenario must never register an execution");
        assert.equal(draft.obtido, "");
        savedCases.push({
          ...draft,
          id: "44444444-4444-4444-8444-" + String(calls.case).padStart(12, "0")
        });
      }
      return json(route, null, 201);
    }
  }
  failures.push("Unexpected backend request: " + method + " " + path);
  return json(route, { message: "Fixture endpoint unavailable" }, 500);
}
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (err) => failures.push(err.message));
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**", fakeBackend);
  await page.goto(ROOT);
  await page.getByRole("textbox", { name: "Email" }).fill(sessionUser.email);
  await page.getByLabel("Senha").fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { name: "Suas tarefas de teste" }).waitFor();

  await page.getByRole("button",{name:"Nova TF",exact:true}).click();
  const wizard=page.getByRole("dialog",{name:/Nova TF — etapa/});
  await wizard.getByRole("button",{name:"Continuar manualmente"}).click();
  await wizard.getByRole("button",{name:"Avançar"}).click();
  assert.equal(calls.task,0,"Empty title must not create the TF");
  await wizard.getByLabel("Título da tarefa").fill("Nova TF com primeiro caso");
  await wizard.getByLabel("Resumo do problema / descrição")
    .fill("Conferir criação e execução manual.");
  await wizard.getByRole("button",{name:"Avançar"}).click();
  assert.equal(calls.task,0,"The TF is only persisted on finish");
  await wizard.getByRole("button",{name:"Pular e finalizar sem casos"}).click();
  await page.getByRole("heading",{name:"Nova TF com primeiro caso"}).waitFor();
  assert.equal(calls.task,1);
  assert.equal(calls.case,0,"Skipping cases must not create an empty scenario");
  await page.getByRole("tab",{name:"Cenários"}).click();
  await page.getByRole("button",{name:"Cenário",exact:true}).click();
  const editor=page.getByRole("dialog",{name:"Cadastrar cenário"});
  await editor.waitFor({timeout:20000});
  assert.equal(savedTasks[0].status, "rascunho");
  await page.waitForFunction(() => !window.location.hash.includes("newScenario"));
  await editor.getByRole("textbox", { name: "Título" }).fill("Primeiro cenário da TF");
  await editor.getByRole("textbox", { name: "Passos" }).fill("1. Abrir o pedido\n2. Aplicar a regra");
  await editor.getByRole("textbox", { name: "Resultado esperado" })
    .fill("O desconto deve respeitar a configuração.");
  await editor.getByRole("button", { name: "Adicionar cenário" }).click();
  await page.getByText("Cenário salvo.").waitFor();
  const createdToast=page.locator(".qa-toast").filter({hasText:"Cenário salvo."});
  await createdToast.waitFor();
  assert.equal(await page.locator(".qa-task-panel .notice")
    .filter({hasText:"Cenário salvo."}).count(),0,
    "Confirmation must not be injected into the task content");
  await createdToast.getByRole("button",{name:/Fechar notificação/}).click();
  assert.equal(await createdToast.count(),0,"Toast should close by its dismiss button");
  assert.equal(calls.case, 1);
  assert.equal(savedCases[0].status, "nao_executado");
  assert.equal(savedTasks[0].status, "rascunho");

  await page.getByRole("tab",{name:"Cenários"}).click();
  await page.getByRole("button",{name:"Cenário",exact:true}).click();
  await editor.waitFor();
  await editor.getByRole("textbox", { name: "Título" }).fill("Segundo cenário consecutivo");
  await editor.getByRole("textbox", { name: "Passos" }).fill("Abrir o painel de pagamentos");
  await editor.getByRole("textbox", { name: "Resultado esperado" })
    .fill("O valor permanece correto.");
  await editor.getByRole("button", { name: "Salvar e criar outro" }).click();
  await page.getByText("Cenário salvo. Preencha o próximo.").waitFor();
  assert.equal(calls.case, 2);
  assert.equal(await editor.count(), 1, "Editor should stay open for the next case");
  await page.waitForFunction(() => document.activeElement?.getAttribute("name") === "titulo");
  assert.equal(await editor.getByRole("textbox", { name: "Título" }).inputValue(), "",
    "Continuing with the next case must clear the previous draft");
  const cancelEditor = editor.getByRole("button", { name: "Cancelar" });
  await cancelEditor.focus();
  await cancelEditor.press("Enter");
  assert.equal(calls.case, 2, "Cancel must not create an empty third case");

  await page.reload();
  await page.getByRole("heading", { name: "Nova TF com primeiro caso" }).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "Cadastrar cenário" }).count(), 0,
    "One-time creation intent must not persist after refresh");
  assert.equal(calls.task, 1, "Refreshing the task must not recreate it");

  await page.getByRole("link", { name: "Todas as TFs" }).click();
  await page.getByRole("button",{name:"Nova TF",exact:true}).click();
  await wizard.getByRole("button",{name:"Continuar manualmente"}).click();
  await wizard.getByLabel("Título da tarefa").fill("TF sem cenário imediato");
  await wizard.getByRole("button",{name:"Avançar"}).click();
  await wizard.getByRole("button",{name:"Pular e finalizar sem casos"}).click();
  await page.getByRole("heading", { name: "TF sem cenário imediato" }).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "Cadastrar cenário" }).count(), 0);
  assert.equal(calls.task, 2);
  assert.equal(calls.case, 2);

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, "Task details should not overflow a 390px viewport");
  assert.deepEqual(failures, [], "Unexpected requests and browser errors");
  console.log("Criação rápida: TF + primeiro caso, casos consecutivos, sem execução automática ou reabertura após refresh.");
} finally {
  await browser.close();
}
