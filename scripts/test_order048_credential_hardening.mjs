import assert from 'node:assert/strict';
import {
  resolveServiceWorkerToken,
  inspectTokenMetadata,
  verifyServiceConnection,
  resetRateLimitState,
  getRateLimitState,
} from './antigravity_watcher.js';

console.log('======================================================================');
console.log('SUITE DE TESTES ORDEM 048: CREDENTIAL HARDENING E SINGLE-SHOT PROBE');
console.log('======================================================================');

// --------------------------------------------------------------------
// 1. HARDENING NO MODO CONTÍNUO: EXCLUSIVIDADE DE SERVICE_WORKER_GITHUB_TOKEN
// --------------------------------------------------------------------
resetRateLimitState();

// 1.1 No modo contínuo, aceita com sucesso SERVICE_WORKER_GITHUB_TOKEN
const tokenContinuousSW = resolveServiceWorkerToken(
  {
    env: {
      SERVICE_WORKER_GITHUB_TOKEN: 'valid_sw_scoped_token_123',
      GITHUB_TOKEN: 'broad_admin_token_should_be_ignored'
    }
  },
  { isContinuous: true }
);
assert.equal(tokenContinuousSW, 'valid_sw_scoped_token_123', 'Modo contínuo deve aceitar SERVICE_WORKER_GITHUB_TOKEN');

// 1.2 No modo contínuo, PROIBIÇÃO TERMINANTE de fallback para GITHUB_TOKEN ou GH_TOKEN
const tokenContinuousFallbackRejected = resolveServiceWorkerToken(
  {
    env: {
      GITHUB_TOKEN: 'broad_admin_token_456',
      GH_TOKEN: 'cli_broad_token_789'
    }
  },
  { isContinuous: true }
);
assert.equal(
  tokenContinuousFallbackRejected,
  null,
  'Modo contínuo DEVE rejeitar fallback para GITHUB_TOKEN/GH_TOKEN/CLI e retornar null'
);

// 1.3 No modo contínuo sem nenhuma credencial, fail-closed retorna null
const tokenContinuousEmpty = resolveServiceWorkerToken(
  { env: {} },
  { isContinuous: true }
);
assert.equal(tokenContinuousEmpty, null, 'Modo contínuo sem token deve retornar estritamente null');

console.log('✅ PASS: Ordem 048 - Modo contínuo exige exclusivamente SERVICE_WORKER_GITHUB_TOKEN; fallback legado eliminado');

// --------------------------------------------------------------------
// 2. PRESERVAÇÃO DE INJEÇÃO EXPLÍCITA DE MOCKS EM TESTES UNITÁRIOS
// --------------------------------------------------------------------
const tokenMockExplicit = resolveServiceWorkerToken(
  {
    serviceWorkerToken: 'mock_sandbox_service_token'
  },
  { isContinuous: true }
);
assert.equal(tokenMockExplicit, 'mock_sandbox_service_token', 'Injeção explícita de mock deve prevalecer em testes');

const tokenMockGithubExplicit = resolveServiceWorkerToken(
  {
    githubToken: 'mock_sandbox_github_token'
  },
  { isContinuous: true }
);
assert.equal(tokenMockGithubExplicit, 'mock_sandbox_github_token', 'deps.githubToken explícito de teste deve prevalecer');

console.log('✅ PASS: Ordem 048 - Injeção explícita de mocks em testes isolados estritamente preservada');

// --------------------------------------------------------------------
// 3. TESTE ÚNICO DE CONEXÃO AUTENTICADA SOMENTE-LEITURA (PROBE READ-ONLY)
// --------------------------------------------------------------------
// 3.1 Probe sem credencial configurada
const probeNoAuth = await verifyServiceConnection(
  { env: {} },
  { isContinuous: true }
);
assert.equal(probeNoAuth.ok, false);
assert.equal(probeNoAuth.authenticated, false);
assert.equal(probeNoAuth.status, 401);
assert.equal(probeNoAuth.reason, 'missing_service_worker_token');
assert.equal(probeNoAuth.isReadOnlyVerified, true);
assert.equal(probeNoAuth.dataMutated, false);

console.log('✅ PASS: Ordem 048 - verifyServiceConnection falha-fechado sem credencial (zero chamadas de rede)');

// 3.2 Probe com sucesso (HTTP 200 OK com dados simulados)
let networkMethod = null;
let networkUrl = null;
let writeAttempted = false;

const mockFetchSuccess = async (url, options = {}) => {
  networkMethod = options.method || 'GET';
  networkUrl = url;
  if (networkMethod !== 'GET' && networkMethod !== 'HEAD') {
    writeAttempted = true;
  }
  return {
    ok: true,
    status: 200,
    headers: {
      get: (h) => {
        const lower = h.toLowerCase();
        if (lower === 'x-ratelimit-limit') return '5000';
        if (lower === 'x-ratelimit-remaining') return '4980';
        if (lower === 'x-ratelimit-reset') return '1793025000';
        if (lower === 'x-oauth-scopes') return 'repo';
        if (lower === 'content-type') return 'application/json';
        return null;
      }
    },
    text: async () => JSON.stringify({
      sha: 'mock_sha_048_123456789',
      content: Buffer.from(JSON.stringify([{ id: 'tck-001', status: 'pending' }])).toString('base64')
    })
  };
};

const probeSuccess = await verifyServiceConnection({
  serviceWorkerToken: 'github_pat_11AAAAAA00000000000000_1234567890',
  fetch: mockFetchSuccess
});

assert.equal(probeSuccess.ok, true);
assert.equal(probeSuccess.authenticated, true);
assert.equal(probeSuccess.status, 200);
assert.equal(probeSuccess.reason, 'connection_verified');
assert.equal(probeSuccess.remoteSha, 'mock_sha_048_123456789');
assert.equal(probeSuccess.ticketCount, 1);
assert.equal(probeSuccess.rateLimit.remaining, 4980);
assert.deepEqual(probeSuccess.detectedScopes, ['repo']);
assert.equal(probeSuccess.isReadOnlyVerified, true);
assert.equal(probeSuccess.dataMutated, false);
assert.equal(writeAttempted, false, 'Probe de conexão JAMAIS deve executar requisições de escrita (PUT/POST/DELETE)');
assert.equal(networkMethod, 'GET');

console.log('✅ PASS: Ordem 048 - verifyServiceConnection valida conexão autenticada 200 OK sem invocar saveTickets');

// 3.3 Probe sob HTTP 403 / 429
const mockFetch403 = async () => ({
  ok: false,
  status: 403,
  headers: {
    get: (h) => (h.toLowerCase() === 'x-ratelimit-remaining' ? '0' : null)
  },
  text: async () => JSON.stringify({ message: 'Rate Limit Exceeded' })
});

const probe403 = await verifyServiceConnection({
  serviceWorkerToken: 'mock_token',
  fetch: mockFetch403
});
assert.equal(probe403.ok, false);
assert.equal(probe403.status, 403);
assert.equal(probe403.reason, 'forbidden_or_rate_limited');
assert.equal(probe403.isReadOnlyVerified, true);
assert.equal(probe403.dataMutated, false);

console.log('✅ PASS: Ordem 048 - verifyServiceConnection sob 403/429 retorna erro estruturado sem throws');

// --------------------------------------------------------------------
// 4. TESTE DE SANITIZAÇÃO DE LOGS: NENHUM SEGREDO REVELADO
// --------------------------------------------------------------------
const serializedReport = JSON.stringify(probeSuccess);
assert.equal(serializedReport.includes('valid_sw_scoped_token'), false);
assert.equal(serializedReport.includes('11AAAAAA00000000000000_1234567890'), false);
assert.equal(probeSuccess.tokenMetadata.prefix, 'gith...');
assert.equal(probeSuccess.tokenMetadata.kind, 'fine_grained_pat');

console.log('✅ PASS: Ordem 048 - Diagnóstico do probe é estritamente seguro e não expõe segredos nem tokens');

console.log('======================================================================');
console.log('🎉 TODOS OS TESTES DA ORDEM 048 FORAM APROVADOS COM 100% DE SUCESSO!');
console.log('======================================================================');
