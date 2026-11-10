import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const root = read("index.html");
const callbackGateway = read("qa.html");
const legacy = read("qa-legacy.html");
const oldIndex = read("index-legacy.html");
const publicEntry = read("public.html");
const generators = read("geradores.html");
const react = read("react/index.html");
const config = read("qa-config.js");
const origin = "https://kaina-visualsoftware.github.io/QA-Hub/";

function redirectFrom(url, html = root) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "A entrada precisa redirecionar explicitamente");
  const location = {
    href: url,
    search: new URL(url).search,
    hash: new URL(url).hash,
    replace(next) { this.destination = next; }
  };
  runInNewContext(script, {
    window: { location },
    URL, URLSearchParams, encodeURIComponent
  });
  return location.destination;
}

test("entrada principal abre React sem renderizar a interface anterior", () => {
  assert.equal(redirectFrom(origin), origin + "react/#/");
  assert.match(root, /href="\.\/react\/"/);
  assert.doesNotMatch(root, /qa-legacy\.html/);
  assert.match(react, /<div id="root"><\/div>/);
  assert.match(react, /\/QA-Hub\/react\/assets\//);
  for (const screen of [legacy, oldIndex, publicEntry, generators]) {
    assert.doesNotMatch(screen, /<script[^>]+src=/i);
    assert.doesNotMatch(screen, /id="auth-form"|id="view-dashboard"|id="tool-frame"/);
    assert.match(screen, /migrada para a interface React/);
  }
});

test("callbacks antigos preservam códigos OTP e fragmentos de recuperação", () => {
  for (const gateway of [root, callbackGateway]) {
    assert.equal(redirectFrom(origin + "qa.html?code=synthetic", gateway),
      origin + "react/auth.html?code=synthetic");
    assert.equal(
      redirectFrom(origin + "?type=recovery#access_token=synthetic&type=recovery", gateway),
      origin + "react/auth.html?type=recovery#access_token=synthetic&type=recovery");
  }
  const oldCallback = redirectFrom(origin + "qa-legacy.html?code=synthetic", legacy);
  assert.equal(oldCallback, origin + "qa.html?code=synthetic");
  assert.equal(redirectFrom(oldCallback, callbackGateway),
    origin + "react/auth.html?code=synthetic");
});

test("links React diretos não perdem a rota ao passar pela raiz", () => {
  for (const hash of ["#/tarefa/11111111-1111-4111-8111-111111111111",
    "#/publicas", "#/painel", "#/ferramentas", "#/perfil", "#/admin", "#/recuperar"]) {
    assert.equal(redirectFrom(origin + hash), origin + "react/" + hash);
    assert.equal(redirectFrom(origin + "qa.html" + hash, callbackGateway),
      origin + "react/" + hash);
  }
  assert.equal(redirectFrom(origin + "#/rota-inexistente"), origin + "react/#/");
});

test("endereços públicos antigos preservam o identificador da TF publicada", () => {
  const tf = "33333333-3333-4333-8333-333333333333";
  assert.equal(redirectFrom(origin + "public.html", publicEntry),
    origin + "react/#/publicas");
  assert.equal(redirectFrom(origin + "public.html?tf=" + tf, publicEntry),
    origin + "react/#/publicas?tf=" + tf);
  assert.equal(redirectFrom(origin + "public.html?tf=unexpected", publicEntry),
    origin + "react/#/publicas");
  assert.equal(redirectFrom(origin + "geradores.html#release", generators),
    origin + "react/#/ferramentas");
  assert.equal(redirectFrom(origin + "geradores.html#post", generators),
    origin + "react/#/");
  assert.equal(redirectFrom(origin + "index-legacy.html", oldIndex),
    origin + "index.html");
});

test("redirecionamento público não expõe credenciais nem retorna à UI antiga", () => {
  assert.match(root, /rel="canonical" href="https:\/\/kaina-visualsoftware\.github\.io\/QA-Hub\/react\/"/);
  assert.ok(config.includes(origin + "qa.html"));
  assert.equal(redirectFrom(origin + "?source=login#/tarefas"), origin + "react/#/");
  assert.doesNotMatch(root + config, /github\.io\/Tarefas/);
  assert.doesNotMatch(read("frontend/src/app/router.tsx"), /qa-legacy\.html/);
  assert.match(config, /authRedirectUrl:\s*'https:\/\/kaina-visualsoftware\.github\.io\/QA-Hub\/qa\.html'/);
  assert.equal(existsSync(new URL("../184728/page.html", import.meta.url)), false);
  const svg = read("favicon.svg");
  const png = readFileSync(new URL("../favicon.png", import.meta.url));
  assert.match(root, /href="\.\/favicon\.png"/);
  assert.equal(png.subarray(0,8).toString("hex"), "89504e470d0a1a0a");
  assert.match(svg, /<svg\b[^>]*viewBox="0 0 64 64"/);
});
