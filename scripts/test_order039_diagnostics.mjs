import assert from 'node:assert/strict';
import {
  safeParseHttpResponse,
  safeSanitizeUrl,
  fetchTickets,
  processTicket,
  runWatchdogCycle,
  DurableClaimStore,
  acquireClaim,
  ackClaim,
  completeClaim,
  deferClaim,
  releaseClaim,
  getClaim
} from './antigravity_watcher.js';

console.log('======================================================================');
console.log('TESTES DE DIAGNÓSTICO ORDEM 039: HTTP SEGURO, RESPOSTAS VAZIAS E ACK');
console.log('======================================================================');

// --------------------------------------------------------------------
// 1. TESTE DE RESPOSTA HTTP 200 VAZIA (0 BYTES / SEM CORPO)
// --------------------------------------------------------------------
// Resposta simulada com status 200 e corpo de tamanho zero (sem throw de Unexpected end of JSON)
const mockEmptyResponse = {
  ok: true,
  status: 200,
  url: 'https://api.github.com/repos/HelpUSA/publicarte/contents/data/helpus_tickets.json?token=secret123',
  headers: {
    get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
  },
  text: async () => '',
};

const emptyParsed = await safeParseHttpResponse(mockEmptyResponse, 'GitHub Contents API');
assert.equal(emptyParsed.ok, false, 'safeParseHttpResponse deve detectar resposta vazia');
assert.equal(emptyParsed.error, 'empty_response_body');
assert.equal(emptyParsed.status, 200);
assert.equal(emptyParsed.origin, 'https://api.github.com/repos/HelpUSA/publicarte/contents/data/helpus_tickets.json', 'Sanitização de URL deve remover tokens/query parameters');

// fetchTickets com resposta vazia não deve lançar exceção não tratada e deve retornar null com segurança
const mockEmptyDeps = {
  fetch: async () => mockEmptyResponse,
};

const emptyTicketsRes = await fetchTickets(mockEmptyDeps);
assert.equal(emptyTicketsRes, null, 'fetchTickets sob resposta vazia na nuvem deve retornar null para preservar dados locais');

console.log('✅ PASS: Ordem 039 - Resposta HTTP 200 vazia tratada com segurança, sem throws e com logs sanitizados');

// --------------------------------------------------------------------
// 2. TESTE DE RESPOSTA HTTP COM JSON INVÁLIDO / MALFORMADO
// --------------------------------------------------------------------
const mockHtmlErrorResponse = {
  ok: true,
  status: 200,
  url: 'https://raw.githubusercontent.com/HelpUSA/publicarte/main/data/helpus_tickets.json',
  headers: {
    get: (name) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
  },
  text: async () => '<html><body>502 Bad Gateway: Upstream timeout</body></html>',
};

const htmlParsed = await safeParseHttpResponse(mockHtmlErrorResponse, 'GitHub Raw');
assert.equal(htmlParsed.ok, false);
assert.equal(htmlParsed.error, 'invalid_json');
assert.equal(htmlParsed.contentType, 'text/html; charset=utf-8');

const mockInvalidJsonDeps = {
  fetch: async () => mockHtmlErrorResponse,
};

const invalidTicketsRes = await fetchTickets(mockInvalidJsonDeps);
assert.equal(invalidTicketsRes, null, 'fetchTickets sob JSON malformado deve retornar null fail-safe');

console.log('✅ PASS: Ordem 039 - Resposta com JSON malformado/HTML tratada com resiliência sem quebrar o processo');

// --------------------------------------------------------------------
// 3. TESTE DE FALHA DE API HTTP 500 / INDISPONIBILIDADE REMOTA
// --------------------------------------------------------------------
const mock500Response = {
  ok: false,
  status: 500,
  url: 'https://api.github.com/repos/HelpUSA/publicarte/contents/data/helpus_tickets.json',
  headers: {
    get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
  },
  text: async () => JSON.stringify({ message: 'GitHub Internal Storage Error' }),
};

const mock500Deps = {
  fetch: async () => mock500Response,
};

const res500 = await fetchTickets(mock500Deps);
assert.equal(res500, null, 'fetchTickets sob HTTP 500 retorna null para evitar falso banco vazio');

console.log('✅ PASS: Ordem 039 - Falha de API HTTP 500 tratada com fail-closed estrito');

// --------------------------------------------------------------------
// 4. TESTE DE SEMÂNTICA ESTRETA DO ACK: PENDING_VERIFICATION NÃO EQUIVALE A COMPLETED
// --------------------------------------------------------------------
class DiagnosticMockStorage {
  constructor(initial = {}) {
    this.data = { ...initial };
  }
  getClaims() {
    return JSON.parse(JSON.stringify(this.data));
  }
  saveClaims(obj) {
    this.data = JSON.parse(JSON.stringify(obj));
  }
}

const diagStorage = new DiagnosticMockStorage();
const queueDiag = new DurableClaimStore({ deps: { claimsStorage: diagStorage }, leaseDurationMs: 60000 });

// A) Claim do chamado BRA-115 em produção
const braClaim1 = queueDiag.acquireClaim('BRA-115', 'in_production', { workerId: 'worker-node-1' });
assert.equal(braClaim1.acquired, true);
assert.equal(braClaim1.fencingToken, 1);

// B) processTicket executado sem autorização de deploy autônomo (allowAutonomousDeploy: false)
// Simulação de retorno de processTicket retido para verificação de governança:
const pendingResult = {
  success: true,
  verified: true,
  tenant: 'Brayyan — Revisão Sistemática com IA',
  status: 'pending_verification'
};

// C) ackClaim recebendo pending_verification DEVE transitar para status 'deferred', NUNCA 'completed'!
const deferAckRes = queueDiag.ackClaim('BRA-115', braClaim1.attemptId, pendingResult);
assert.equal(deferAckRes.deferred, true, 'ackClaim com pending_verification deve deferir o job');

const savedBraClaim = diagStorage.getClaims()['BRA-115'];
assert.equal(savedBraClaim.status, 'deferred', 'Status no storage deve ser estritamente deferred');
assert.equal(savedBraClaim.completedAt, null, 'completedAt DEVE ser estritamente null para job retido');
assert.equal(savedBraClaim.deferredReason, 'pending_verification');
assert.ok(savedBraClaim.deferredAt, 'deferredAt deve estar preenchido');

// D) Próximo ciclo do watchdog: acquireClaim NÃO pode considerar o job 'already_completed'!
const secondCycleAttempt = queueDiag.acquireClaim('BRA-115', 'in_production', {
  allowAutonomousDeploy: false, // Mantido desativado para homologação humana
});
assert.equal(secondCycleAttempt.acquired, false);
assert.equal(secondCycleAttempt.reason, 'held_pending_governance_verification', 'Razão deve ser held_pending_governance_verification, NUNCA already_completed');
assert.equal(secondCycleAttempt.status, 'deferred');

// E) Conclusão verificada legítima: somente ocorre quando há recibos completos de resolução
const completeResult = {
  success: true,
  verified: true,
  status: 'resolved',
  progressPercentage: 100,
  solutionMessage: 'Alteração homologada e comprovada em produção.'
};

const completeRes = queueDiag.ackClaim('BRA-115', braClaim1.attemptId, completeResult);
assert.equal(completeRes.completed, true, 'ackClaim com status resolved deve marcar como completed');

const completedClaimSaved = diagStorage.getClaims()['BRA-115'];
assert.equal(completedClaimSaved.status, 'completed', 'Status deve ser completed apenas sob resolução comprovada');
assert.ok(completedClaimSaved.completedAt, 'completedAt deve estar devidamente registrado');

// F) Agora sim, um novo claim é rejeitado com 'already_completed'
const thirdCycleAttempt = queueDiag.acquireClaim('BRA-115', 'in_production', { allowAutonomousDeploy: false });
assert.equal(thirdCycleAttempt.acquired, false);
assert.equal(thirdCycleAttempt.reason, 'already_completed', 'Somente após completion comprovada deve retornar already_completed');

console.log('✅ PASS: Ordem 039 - Semântica de ACK validada: distinção estrita entre deferred, acknowledged, failed e completed');

// --------------------------------------------------------------------
// 5. TESTE DE PRESERVAÇÃO DE EVIDÊNCIAS DE CLAIMS DE BRA-115
// --------------------------------------------------------------------
const existingEvidenceStorage = new DiagnosticMockStorage({
  'BRA-115': {
    ticketId: 'BRA-115',
    attemptId: 'att-evidence-bra115-original',
    fencingToken: 1,
    workerId: 'worker-original',
    status: 'deferred',
    ticketStatus: 'in_production',
    claimedAt: '2026-10-26T10:45:00.000Z',
    leaseExpiresAt: '2026-10-26T10:46:00.000Z',
    completedAt: null,
    deferredAt: '2026-10-26T10:45:10.000Z',
    deferredReason: 'pending_verification',
    result: { status: 'pending_verification' }
  }
});

const queueEvidence = new DurableClaimStore({ deps: { claimsStorage: existingEvidenceStorage } });
const braClaimExisting = queueEvidence.getClaim('BRA-115');
assert.ok(braClaimExisting, 'Claim de BRA-115 deve ser preservado');
assert.equal(braClaimExisting.attemptId, 'att-evidence-bra115-original');
assert.equal(braClaimExisting.status, 'deferred');
assert.equal(braClaimExisting.completedAt, null);

console.log('✅ PASS: Ordem 039 - Preservação estrita de evidências e integridade de claims de BRA-115');

console.log('======================================================================');
console.log('🎉 TODOS OS TESTES DE DIAGNÓSTICO DA ORDEM 039 APROVADOS (5/5)!');
console.log('======================================================================');
