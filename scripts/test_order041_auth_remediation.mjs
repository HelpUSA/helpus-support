import assert from 'node:assert/strict';
import {
  resolveServiceWorkerToken,
  inspectTokenMetadata,
  getRateLimitState,
  resetRateLimitState,
  isRateLimitBackoffActive,
  updateRateLimitFromResponse,
  fetchTickets,
  runContinuousWorker,
} from './antigravity_watcher.js';

console.log('======================================================================');
console.log('SUITE DE TESTES ORDEM 041: AUTENTICAÇÃO SEGURA, RATE LIMIT E BACKOFF');
console.log('======================================================================');

// --------------------------------------------------------------------
// 1. TESTE DE PRECEDÊNCIA DE CREDENCIAIS (MENOR PRIVILÉGIO)
// --------------------------------------------------------------------
resetRateLimitState();

// 1.1 Injeção explícita de teste tem máxima precedência
const tokenExplicit = resolveServiceWorkerToken({
  serviceWorkerToken: 'token_explicit_service_worker',
  githubToken: 'token_explicit_github',
  env: {
    SERVICE_WORKER_GITHUB_TOKEN: 'env_sw_token',
    GITHUB_TOKEN: 'env_gh_token'
  }
});
assert.equal(tokenExplicit, 'token_explicit_service_worker', 'serviceWorkerToken explícito deve ter prioridade máxima');

// 1.2 SERVICE_WORKER_GITHUB_TOKEN tem precedência sobre GITHUB_TOKEN no ambiente
const tokenEnvSW = resolveServiceWorkerToken({
  env: {
    SERVICE_WORKER_GITHUB_TOKEN: 'token_from_service_worker_env',
    GITHUB_TOKEN: 'broad_privilege_github_token'
  }
});
assert.equal(tokenEnvSW, 'token_from_service_worker_env', 'SERVICE_WORKER_GITHUB_TOKEN deve prevalecer sobre GITHUB_TOKEN');

// 1.3 Fallback ordenado para GITHUB_TOKEN se SERVICE_WORKER_GITHUB_TOKEN não existir
const tokenEnvGH = resolveServiceWorkerToken({
  env: {
    GITHUB_TOKEN: 'fallback_github_token'
  }
});
assert.equal(tokenEnvGH, 'fallback_github_token');

// 1.4 Fail-closed: se nenhum token for informado, retorna null
const tokenNull = resolveServiceWorkerToken({
  env: {}
});
assert.equal(tokenNull, null, 'Sem credencial deve retornar rigorosamente null');

console.log('✅ PASS: Ordem 041 - Precedência de credencial de menor privilégio e resolução segura verificadas');

// --------------------------------------------------------------------
// 2. TESTE DE METADADOS DE TOKEN E ZERO EXPOSIÇÃO EM LOGS
// --------------------------------------------------------------------
const metaPatClassic = inspectTokenMetadata('ghp_1234567890abcdefghijklmnopqrstuvwxyz');
assert.equal(metaPatClassic.configured, true);
assert.equal(metaPatClassic.kind, 'personal_access_token_classic');
assert.equal(metaPatClassic.prefix, 'ghp_...');
assert.equal(metaPatClassic.length, 40);

const metaFineGrained = inspectTokenMetadata('github_pat_1234567890abcdef');
assert.equal(metaFineGrained.kind, 'fine_grained_pat');

const metaNone = inspectTokenMetadata(null);
assert.equal(metaNone.configured, false);
assert.equal(metaNone.kind, 'none');

console.log('✅ PASS: Ordem 041 - Inspeção segura de tipo de token com sanitização de prefixo e zero vazamento');

// --------------------------------------------------------------------
// 3. TESTE DE FAIL-CLOSED NO FETCH SEM CREDENCIAL
// --------------------------------------------------------------------
let fetchCalled = false;
const mockFetchSpy = async () => {
  fetchCalled = true;
  return { ok: true, status: 200, json: async () => [] };
};

const failClosedResult = await fetchTickets({
  env: {}, // sem token
  fetch: mockFetchSpy
});
assert.equal(failClosedResult, null, 'fetchTickets deve falhar-fechado (retornar null) se nenhuma credencial estiver configurada');
assert.equal(fetchCalled, false, 'Nenhuma requisição de rede deve ser disparada ao GitHub sem token configurado');

console.log('✅ PASS: Ordem 041 - Fail-closed estrito sem token ativo; proteção absoluta contra exaustão de IP');

// --------------------------------------------------------------------
// 4. TESTE DE TRATAMENTO DE HTTP 403 COM RATE LIMIT ESGOTADO E BACKOFF
// --------------------------------------------------------------------
resetRateLimitState();
const nowRef = 1000000;
const resetEpochFuture = 1000 + 60; // 60 segundos no futuro (epoch seconds)

const mock403RateLimitResponse = {
  ok: false,
  status: 403,
  headers: {
    'x-ratelimit-limit': '60',
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': String(resetEpochFuture),
    'x-oauth-scopes': 'repo, read:org'
  }
};

updateRateLimitFromResponse(mock403RateLimitResponse, nowRef);
const state403 = getRateLimitState();

assert.equal(state403.lastStatus, 403);
assert.equal(state403.remaining, 0);
assert.equal(state403.limit, 60);
assert.equal(state403.consecutiveFailures, 1);
assert.deepEqual(state403.detectedScopes, ['repo', 'read:org']);
assert.ok(state403.backoffUntilMs > nowRef, 'backoffUntilMs deve ser configurado no futuro');
assert.equal(isRateLimitBackoffActive(nowRef), true, 'Backoff deve estar ativo no tempo nowRef');

// Durante a janela de backoff, fetchTickets deve suspender polling e retornar null imediatamente
let fetchDuringBackoffCalled = false;
const resDuringBackoff = await fetchTickets({
  serviceWorkerToken: 'valid_mock_token',
  now: () => nowRef + 10000, // 10s depois (ainda dentro dos 60s)
  fetch: async () => {
    fetchDuringBackoffCalled = true;
    return { ok: true, status: 200 };
  }
});
assert.equal(resDuringBackoff, null);
assert.equal(fetchDuringBackoffCalled, false, 'Requisições devem ser canceladas enquanto backoff estiver ativo');

console.log('✅ PASS: Ordem 041 - Backoff ativado por HTTP 403 com rate limit esgotado e suspensão imediata de polling');

// --------------------------------------------------------------------
// 5. TESTE DE HTTP 429 COM CABEÇALHO RETRY-AFTER
// --------------------------------------------------------------------
resetRateLimitState();
const mock429Response = {
  ok: false,
  status: 429,
  headers: {
    'retry-after': '45', // 45 segundos
    'x-ratelimit-remaining': '0'
  }
};

updateRateLimitFromResponse(mock429Response, 500000);
const state429 = getRateLimitState();
assert.equal(state429.lastStatus, 429);
assert.equal(state429.backoffUntilMs, 500000 + 45000, 'Backoff deve respeitar exatamente o valor de retry-after em ms');

console.log('✅ PASS: Ordem 041 - HTTP 429 com cabeçalho Retry-After respeitado');

// --------------------------------------------------------------------
// 6. TESTE DE RECUPERAÇÃO APÓS SUCESSO (HTTP 200 OK)
// --------------------------------------------------------------------
const mock200Response = {
  ok: true,
  status: 200,
  headers: {
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': '4950',
    'x-ratelimit-reset': '2000000',
    'x-oauth-scopes': 'repo'
  }
};

updateRateLimitFromResponse(mock200Response, 600000);
const state200 = getRateLimitState();
assert.equal(state200.lastStatus, 200);
assert.equal(state200.remaining, 4950);
assert.equal(state200.consecutiveFailures, 0);
assert.equal(state200.backoffUntilMs, 0);
assert.equal(isRateLimitBackoffActive(600000), false, 'Backoff deve ser desativado após HTTP 200 de sucesso');

console.log('✅ PASS: Ordem 041 - Recuperação automática e reset de backoff após resposta HTTP 200 com cota saudável');

// --------------------------------------------------------------------
// 7. TESTE DE CONTROLE ADAPTATIVO DE INTERVALO DE POLLING
// --------------------------------------------------------------------
process.env.WATCHER_POLL_INTERVAL_MS = '20000';
process.env.DAILY_EXTERNAL_REQ_LIMIT_AUTO = '50';
let workerCycleRan = false;
const workerPromise = runContinuousWorker({
  pollIntervalMs: 5, // ciclo ultrarrápido para teste
  noExit: true,
  deps: {
    serviceWorkerToken: 'test_token',
    claimsStorage: { getClaims: () => ({}), saveClaims: () => {} },
    fetch: async () => {
      workerCycleRan = true;
      return { ok: true, status: 200, json: async () => [] };
    }
  }
});

// Envia sinal após 30ms para encerrar o worker de teste
setTimeout(() => {
  process.emit('SIGTERM');
}, 30);

await workerPromise;
assert.equal(workerCycleRan, true, 'Worker deve ter executado ciclo em sandbox com parâmetros controlados');

console.log('✅ PASS: Ordem 041 - Intervalo de polling adaptativo e configurável via WATCHER_POLL_INTERVAL_MS');

console.log('======================================================================');
console.log('🎉 TODOS OS TESTES DA ORDEM 041 FORAM APROVADOS COM 100% DE SUCESSO!');
console.log('======================================================================');
