import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const callbackGateway = readFileSync(new URL('../qa.html', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('../qa-legacy.html', import.meta.url), 'utf8');
const react = readFileSync(new URL('../react/index.html', import.meta.url), 'utf8');
const config = readFileSync(new URL('../qa-config.js', import.meta.url), 'utf8');
const origin = 'https://kaina-visualsoftware.github.io/QA-Hub/';

function redirectFrom(url, html = root) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'A entrada deve preservar um redirecionamento explícito');
  const location = {
    href: url,
    search: new URL(url).search,
    hash: new URL(url).hash,
    replace(next) { this.destination = next; }
  };
  runInNewContext(script, { window: { location }, URL });
  return location.destination;
}

test('entrada principal abre React versionado, mantendo fallback legado', () => {
  assert.equal(redirectFrom(origin), origin + 'react/#/');
  assert.match(root, /href="\.\/react\/"/);
  assert.match(root, /href="\.\/qa-legacy\.html"/);
  assert.match(react, /<div id="root"><\/div>/);
  assert.match(react, /\/QA-Hub\/react\/assets\//);
});

test('tokens de autenticação e recuperação são repassados ao callback isolado', () => {
  for (const gateway of [root, callbackGateway]) {
    assert.equal(
      redirectFrom(origin + 'qa.html?code=synthetic', gateway),
      origin + 'react/auth.html?code=synthetic'
    );
    assert.equal(
      redirectFrom(origin + '?type=recovery#access_token=synthetic&type=recovery', gateway),
      origin + 'react/auth.html?type=recovery#access_token=synthetic&type=recovery'
    );
    assert.equal(
      redirectFrom(origin + 'index.html#/tarefas', gateway),
      origin + 'react/#/'
    );
  }
});

test('URLs públicas e allowlist legada não são confundidas com segredos', () => {
  assert.match(root, /rel="canonical" href="https:\/\/kaina-visualsoftware\.github\.io\/QA-Hub\/react\/"/);
  assert.ok(config.includes(origin + 'qa.html'));
  assert.equal(redirectFrom(origin + '?source=login#/tarefas'), origin + 'react/#/');
  assert.doesNotMatch(root + config, /github\.io\/Tarefas/);
});

test('fallback legado mantém módulos e autenticação visíveis', () => {
  assert.doesNotMatch(legacy, /href=["']\.\/index\.html["']/i);
  assert.match(legacy, /id="auth-form"/);
  assert.match(legacy, /id="view-dashboard"/);
  assert.match(legacy, /id="view-ferramentas"/);
  assert.match(config, /authRedirectUrl:\s*'https:\/\/kaina-visualsoftware\.github\.io\/QA-Hub\/qa\.html'/);
  assert.equal(existsSync(new URL('../184728/page.html', import.meta.url)), false);
});

test('root e fallback legado mantêm favicon do QA Hub', () => {
  const svg = readFileSync(new URL('../favicon.svg', import.meta.url), 'utf8');
  for (const html of [root, legacy]) {
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg">/);
  }
  assert.match(svg, /<svg\b[^>]*viewBox="0 0 64 64"/);
  assert.match(svg, /<rect\b[^>]*fill="#112d39"/);
  assert.match(svg, /#1eb8a3/);
});

test('menu da versão legada permanece acessível para rollback', () => {
  assert.match(legacy, /<button class="menu-button"[^>]*aria-label="Abrir menu"[^>]*aria-expanded="false"/);
  assert.match(legacy, /<svg class="menu-icon"[^>]*stroke="currentColor"/);
  assert.doesNotMatch(legacy, /type="button">☰<\/button>/);
});
