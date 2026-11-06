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
const violations = [];
const exceptions = [];
const loadedAssets = [];
const browser = await chromium.launch({ headless: true });

function respond(route) {
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
  if (path.endsWith("/rest/v1/qa_admins")) return send(null);
  if (path.endsWith("/rest/v1/qa_tarefas")) {
    if (url.searchParams.has("publica")) {
      assert.equal(url.searchParams.get("publica"), "eq.true");
      return send(url.searchParams.has("id") ? task : [task]);
    }
    return send([task]);
  }
  if (path.endsWith("/rest/v1/qa_cenarios")) return send([]);
  if (path.endsWith("/rest/v1/qa_diagramas")) return send([]);
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
  for (const width of [390, 1366]) {
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

    await page.goto(BASE);
    await page.getByRole("textbox", { name: "Email" }).fill("a11y@example.invalid");
    await page.getByLabel("Senha").fill("fixture-password");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("heading", { name: "Suas tarefas de teste" }).waitFor();
    await axeAudit(page, "workspace autenticado", width);

    await page.getByRole("button", { name: "Nova TF" }).click();
    await page.getByRole("heading", { name: "Nova TF" }).waitFor();
    await axeAudit(page, "formulário Nova TF", width);
    await page.close();
  }
  assert.equal(loadedAssets.length, 0,
    "Model worker or model data requested before explicit opt-in: " + loadedAssets.join("; "));
  assert.deepEqual(exceptions, [], "Browser errors or unexpected fixture network requests");
  if (violations.length) {
    console.error("Falhas WCAG detectadas:", JSON.stringify(violations, null, 2));
    throw Error(violations.length + " conjuntos de violações WCAG no React.");
  }
  console.log("WCAG 2.0/2.1/2.2 A/AA: 14 telas em 390/1366 px sem violações automáticas; IA permanece lazy.");
} finally {
  await browser.close();
}
