#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Node.js >= 22.12 e npm são necessários.' >&2
  exit 2
fi

node -e 'const v=process.versions.node.split(".").map(Number);if(v[0]<22||(v[0]===22&&v[1]<12)){console.error("Node.js >= 22.12 necessário.");process.exit(2)}'

cd "$ROOT/frontend"
if [[ ! -x node_modules/.bin/vite ]]; then
  echo 'Instalando dependências do frontend com versões travadas...'
  npm ci
fi

echo '[1/7] TypeScript'
npm run typecheck
echo '[2/7] ESLint'
npm run lint
echo '[3/7] Vitest (até dois workers)'
npm test -- --maxWorkers=2
echo '[4/7] Build'
npm run build
echo '[5/7] Orçamento de bundle'
node scripts/check-bundle-budget.mjs
cd "$ROOT"
echo '[6/7] Testes de domínio Node'
node --test tests/*.test.mjs
echo '[7/7] Validação de evidências da Edge Function NVIDIA'
node --test supabase/functions/qa-context/facts.test.mjs

echo 'Validação automatizada concluída. Ainda é necessário revisar o layout real (390px, 768px e 1366px) e a integração Supabase/NVIDIA.'
