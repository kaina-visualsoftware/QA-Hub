import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const qa = readFileSync(new URL('../qa.html', import.meta.url), 'utf8');
const config = readFileSync(new URL('../qa-config.js', import.meta.url), 'utf8');
const redirectCode = root.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function redirectFrom(url) {
  const location = {
    href: url,
    search: new URL(url).search,
    hash: new URL(url).hash,
    replace(next) { this.destination = next; }
  };
  assert.ok(redirectCode, 'The root page must have a redirect script');
  runInNewContext(redirectCode, { window: {location}, URL });
  return location.destination;
}

test('GitHub Pages root opens QA without showing another homepage', () => {
  assert.equal(
    redirectFrom('https://kaina-visualsoftware.github.io/QA-Hub/'),
    'https://kaina-visualsoftware.github.io/QA-Hub/qa.html'
  );
  assert.doesNotMatch(root, /pastaConfig|renderizarCards|HubTarefas|tailwindcss/i);
});

test('root preserves search and hash for auth callbacks and deep links', () => {
  assert.equal(
    redirectFrom('https://kaina-visualsoftware.github.io/QA-Hub/?next=home#access_token=example&type=signup'),
    'https://kaina-visualsoftware.github.io/QA-Hub/qa.html?next=home#access_token=example&type=signup'
  );
  assert.equal(
    redirectFrom('https://kaina-visualsoftware.github.io/QA-Hub/index.html#/tarefas'),
    'https://kaina-visualsoftware.github.io/QA-Hub/qa.html#/tarefas'
  );
});

test('single QA UI has no legacy-home navigation', () => {
  assert.doesNotMatch(qa, /href=["']\.\/index\.html["']/i);
  assert.doesNotMatch(qa, /Hub anterior|Voltar ao Hub de Tarefas/i);
  assert.match(qa, /id="auth-form"/);
  assert.match(qa, /id="view-dashboard"/);
  assert.match(config, /authRedirectUrl:\s*'https:\/\/kaina-visualsoftware\.github\.io\/QA-Hub\/qa\.html'/);
  assert.equal(existsSync(new URL('../184728/page.html', import.meta.url)), false);
});


test('both entrypoints provide the QA Hub favicon', () => {
  const svg = readFileSync(new URL('../favicon.svg', import.meta.url), 'utf8');
  for(const html of [root,qa]){
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg">/);
  }
  assert.match(svg, /<svg\b[^>]*viewBox="0 0 64 64"/);
  assert.match(svg, /<rect\b[^>]*fill="#112d39"/);
  assert.match(svg, /#1eb8a3/);
});

test('mobile menu uses an accessible SVG instead of a faint text glyph', () => {
  assert.match(qa, /<button class="menu-button"[^>]*aria-label="Abrir menu"[^>]*aria-expanded="false"/);
  assert.match(qa, /<svg class="menu-icon"[^>]*stroke="currentColor"/);
  assert.doesNotMatch(qa, /type="button">☰<\/button>/);
});
