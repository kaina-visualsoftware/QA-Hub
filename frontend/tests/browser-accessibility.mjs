import {mockF4Rpc} from "./f4-mock-rpc.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:4173/QA-Hub/";
const USER = "11111111-1111-4111-8111-111111111111";
const TASK = "33333333-3333-4333-8333-333333333333";
const person = {
  id: USER, email: "a11y@example.invalid", aud: "authenticated",
  role: "authenticated", app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {}, created_at: "2026-11-06T12:00:00Z"
};
const task = {
  id: TASK, user_id: USER, titulo: "Revisão de desconto",
  codigo: "67866", descricao: "Verificar regras de desconto",
  tipo_teste: "BUILD", status: "rascunho", sistema: "Financeiro",
  versao: "12.08.08.0000", publica: true,
  executado_em: "2026-11-06", updated_at: "2026-11-06T12:00:00Z",
  observacoes: "", explicacao: "", causa: "", correcao: "", conclusao: ""
};
const scenario = {
  id: "55555555-5555-4555-8555-555555555555",
  tarefa_id: TASK, user_id: USER, titulo: "Aplicar desconto na venda",
  ordem: 1, passos: "Abrir pedido e remover desconto",
  esperado: "Desconto zerado", obtido: "", observacoes: "",
  status: "nao_executado"
};
const diagram = {
  id: "66666666-6666-4666-8666-666666666666",
  titulo: "Fluxo da operação",
  conteudo: "flowchart LR\n A[Pedido] --> B[Desconto]"
};
const violations = [];
const exceptions = [];
const loadedAssets = [];
const browser = await chromium.launch({ headless: true });

async function respond(route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, prefer, accept",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
  };
  const send = (body, status = 200) => route.fulfill({
    status, headers: cors, contentType: "application/json", body: JSON.stringify(body)
  });
  if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  if (path.endsWith("/auth/v1/token")) return send({
    access_token: "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
    refresh_token: "a11y-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now()/1000) + 3600, user: person
  });
  if (path.endsWith("/auth/v1/user")) return send(person);
  if(await mockF4Rpc(route,[task],[scenario]))return;
  if (path.endsWith("/rest/v1/qa_admins")) return send(null);
  if (path.endsWith("/rest/v1/rpc/qa_public_tasks_v1")) {
    assert.equal(method,"POST");
    const {id,titulo,codigo,tipo_teste,sistema,versao,executado_em}=task;
    return send([{id,titulo,codigo,tipo_teste,sistema,versao,executado_em}]);
  }
  if (path.endsWith("/rest/v1/rpc/qa_public_task_v1")) {
    assert.equal(method,"POST");
    assert.equal(request.postDataJSON()?.p_task_id,TASK);
    const {id,titulo,codigo,tipo_teste,sistema,versao,executado_em,
      status,descricao,explicacao,causa,correcao,conclusao,observacoes}=task;
    const {id:scenarioId,titulo:scenarioTitle,ordem,passos,esperado,obtido,
      observacoes:scenarioNotes,status:scenarioStatus}=scenario;
    return send({
      task:{id,titulo,codigo,tipo_teste,sistema,versao,executado_em,
        status,descricao,explicacao,causa,correcao,conclusao,observacoes},
      scenarios:[{id:scenarioId,titulo:scenarioTitle,ordem,passos,esperado,
        obtido,observacoes:scenarioNotes,status:scenarioStatus}],
      diagrams:[diagram]
    });
  }
  if (path.endsWith("/rest/v1/qa_tarefas")) {
    assert.equal(url.searchParams.has("publica"),false,
      "Public pages cannot select from the base table");
    return send([task]);
  }
  if (path.endsWith("/rest/v1/qa_cenarios")) return send([scenario]);
  if (path.endsWith("/rest/v1/qa_diagramas")) return send([diagram]);
  exceptions.push("Unexpected request: " + method + " " + path);
  return send({ message: "Unsupported synthetic endpoint" }, 500);
}

async function axeAudit(page, screen, width) {
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const result = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "region": { enabled: false } }
  }));
  for (const finding of result.violations) {
    violations.push({
      screen, width, rule: finding.id, impact: finding.impact,
      nodes: finding.nodes.slice(0, 8).map((node) => ({
        target: node.target.join(" "), failure: node.failureSummary?.slice(0, 250)
      }))
    });
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  if (overflow > 1) {
    violations.push({ screen, width, rule: "horizontal-overflow", pixels: overflow });
  }
  const focusable = await page.locator("button, a[href], input, select, textarea").count();
  assert.ok(focusable > 0, "Expected keyboard controls in " + screen);
}

async function attach(page, width) {
  await page.setViewportSize({ width, height: 844 });
  page.on("pageerror", (error) => exceptions.push(width + "px: " + error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (/huggingface\.co|jsdelivr\.net|ort-wasm|qa-open-model\.worker|\.onnx(?:\?|$)/i.test(url)) {
      loadedAssets.push(url.slice(0, 180));
    }
  });
  await page.route("**/pqadmlhcsimlcclpkyov.supabase.co/**", respond);
}

try {
  for (const width of [320, 390, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await attach(page, width);
    await page.goto(BASE);
    await page.getByRole("heading", { name: "Entrar", exact: true }).waitFor();
    await axeAudit(page, "login", width);

    await page.getByRole("button", { name: "Criar uma conta" }).click();
    await page.getByRole("heading", { name: "Criar conta" }).waitFor();
    await axeAudit(page, "cadastro", width);
    await page.getByRole("button", { name: "Já tenho conta" }).click();
    await page.getByRole("button", { name: "Esqueci a senha" }).click();
    await page.getByRole("heading", { name: "Recuperar senha" }).waitFor();
    await axeAudit(page, "recuperação", width);

    await page.goto(BASE + "#/publicas");
    await page.getByRole("heading", { name: "TFs públicas" }).waitFor();
    await page.getByText("Revisão de desconto").waitFor();
    await axeAudit(page, "biblioteca pública", width);

    await page.getByText("Revisão de desconto").click();
    await page.getByRole("heading", { name: "Cenários de teste" }).waitFor();
    await axeAudit(page, "TF pública detalhada", width);
    const diagramArea = page.getByRole("article").filter({ hasText: "Fluxo da operação" });
    const view = diagramArea.getByRole("button", { name: "Visualizar" });
    await view.click();
    await diagramArea.getByTitle("Prévia pública: Fluxo da operação").waitFor({ timeout: 30000 });
    const expand = diagramArea.getByRole("button", { name: "Ampliar" });
    await expand.focus();
    await expand.press("Enter");
    const zoom = page.getByRole("dialog", { name: "Diagrama ampliado: Fluxo da operação" });
    await zoom.waitFor();
    const close = zoom.getByRole("button", { name: "Fechar" });
    await close.focus();
    await close.press("Tab");
    assert.equal(await zoom.getByText("Consultar texto do diagrama").evaluate(
      (el) => el === document.activeElement
    ), true, "Tab must stay in Mermaid zoom");
    await page.keyboard.press("Tab");
    assert.equal(await close.evaluate((el) => el === document.activeElement), true,
      "Tab must cycle back to zoom close button");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await zoom.getByText("Consultar texto do diagrama").evaluate(
      (el) => el === document.activeElement
    ), true, "Shift+Tab must cycle to the last modal control");
    await page.keyboard.press("Escape");
    await zoom.waitFor({ state: "hidden" });
    assert.equal(await expand.evaluate((el) => el === document.activeElement), true,
      "Escape must return focus to the diagram's Ampliar button");

    await page.goto(BASE);
    await page.getByRole("textbox", { name: "Email" }).fill("a11y@example.invalid");
    await page.getByLabel("Senha").fill("fixture-password");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("heading", { name: "Suas tarefas de teste" }).waitFor();
    await axeAudit(page, "workspace autenticado", width);

    if(width<=390){
      assert.equal(await page.getByRole("link",{name:"TFs públicas"}).isVisible(),true,
        "Public navigation must remain available on mobile.");
    }
    await page.getByRole("button", { name: "Nova TF" }).click();
    const taskModal=page.getByRole("dialog",{name:/Nova TF — etapa/});
    await taskModal.waitFor();
    assert.equal(await page.locator("#root").evaluate(el=>el.inert),true,
      "Background must be inert while a modal is open.");
    await axeAudit(page, "formulário Nova TF", width);
    await page.goto(BASE + "#/tarefa/" + TASK);
    await page.getByRole("heading", { name: "Revisão de desconto" }).waitFor();
    await axeAudit(page, "TF com fluxo rápido", width);
    await page.getByRole("tab",{name:"Cenários"}).click();
    const workflow=page.getByRole("tabpanel",{name:"Cenários"});
    const quickCreate=workflow.getByRole("button",{name:"Cenário",exact:true});
    await page.getByRole("button",{name:"Guiado",exact:true}).click();
    await page.getByRole("button",{name:"Lista",exact:true}).click();
    await page.getByRole("button",{name:"Pendentes",exact:true}).click();
    await page.locator('[data-qa-next-pending="true"]').waitFor();
    await page.waitForFunction(() =>
      document.activeElement?.getAttribute("data-qa-next-pending") === "true");
    assert.equal(await page.getByRole("button",{name:"Pendentes", exact:true}).getAttribute("aria-pressed"),"true");
    assert.equal(await page.getByRole("dialog").count(),0,
      "Selecting pending scenarios must never record a result automatically");
    await quickCreate.click();
    const editor = page.getByRole("dialog", { name: "Cadastrar cenário" });
    await editor.waitFor();
    assert.equal(await page.locator("#root").evaluate(el=>el.inert),true,
      "Scenario modal must prevent accidental background interaction.");
    const caseTitle = editor.getByRole("textbox", { name: "Título" });
    await page.waitForFunction(() =>
      document.activeElement?.getAttribute("name") === "titulo");
    assert.equal(await caseTitle.evaluate((el) => el === document.activeElement), true,
      "Quick scenario creation must focus its title field");
    const cancelCase = editor.getByRole("button",{name:"Cancelar"});
    await cancelCase.focus();
    await cancelCase.press("Enter");
    await editor.waitFor({state:"hidden"});
    await page.waitForFunction(()=>document.getElementById("root")?.inert===false);
    assert.equal(await page.locator("#root").evaluate(el=>el.inert),false,
      "Closing the scenario dialog must unlock background controls.");
    const scenarioActions = page.getByRole("group", { name: "Resultado de Aplicar desconto na venda" });
    const failButton = scenarioActions.getByRole("button", { name: "Não funcionou" });
    await failButton.focus();
    await failButton.press("Enter");
    const failureDialog = page.getByRole("dialog", { name: "Registrar falha" });
    await failureDialog.waitFor();
    const description = failureDialog.getByRole("textbox", { name: "Comportamento observado" });
    assert.equal(await description.evaluate((el) => el === document.activeElement), true,
      "Opening a result dialog must focus the observed text field");
    await description.fill("O desconto permaneceu visível.");
    await description.press("Tab");
    const cancel = failureDialog.getByRole("button", { name: "Cancelar" });
    assert.equal(await cancel.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press("Tab");
    const save = failureDialog.getByRole("button", { name: "Salvar resultado" });
    assert.equal(await save.evaluate((el) => el === document.activeElement), true);
    const closeResult = failureDialog.getByRole("button",{name:"Fechar Registrar falha"});
    await page.keyboard.press("Tab");
    assert.equal(await closeResult.evaluate(el=>el===document.activeElement),true,
      "Tab after save must reach the accessible modal close button");
    await page.keyboard.press("Tab");
    assert.equal(await description.evaluate(el=>el===document.activeElement),true,
      "Tab after the close button must cycle back to the observation");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await closeResult.evaluate(el=>el===document.activeElement),true,
      "Shift+Tab from the first field returns to the close control");
    page.once("dialog",dialog=>void dialog.accept());
    await page.keyboard.press("Escape");
    await failureDialog.waitFor({ state: "hidden" });
    await page.waitForFunction(()=>document.activeElement?.textContent?.trim()==="Não funcionou");
    assert.equal(await failButton.evaluate((el) => el === document.activeElement), true,
      "Closing the result dialog must restore focus to the status action");
    await page.close();
  }
  assert.equal(loadedAssets.length, 0,
    "Model worker or model data requested before explicit opt-in: " + loadedAssets.join("; "));
  assert.deepEqual(exceptions, [], "Browser errors or unexpected fixture network requests");
  if (violations.length) {
    console.error("Falhas WCAG detectadas:", JSON.stringify(violations, null, 2));
    throw Error(violations.length + " conjuntos de violações WCAG no React.");
  }
  console.log("WCAG AA: 24 estados em 320/390/1366 px, fluxo rápido, foco de modal e IA lazy.");
} finally {
  await browser.close();
}
