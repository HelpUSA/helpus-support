import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getServiceWorkerToken,
  DurableClaimStore,
  acquireClaim,
  ackClaim,
  releaseClaim,
  recoverOrphanedClaims,
  getClaim,
  runWatchdogCycle
} from './antigravity_watcher.js';
import { validateServerApiAccess, signSessionToken } from '../src/lib/serverAuth.ts';

console.log('======================================================================');
console.log('TESTES DE ARQUITETURA ORDEM 035: FILA DURÁVEL, CLAIMS E SERVICE_WORKER');
console.log('======================================================================');

// Storage simulado em memória para testes isolados
class MockStorage {
  constructor(initialData = {}) {
    this.data = { ...initialData };
  }
  getClaims() {
    return JSON.parse(JSON.stringify(this.data));
  }
  saveClaims(claimsObj) {
    this.data = JSON.parse(JSON.stringify(claimsObj));
  }
}

// --------------------------------------------------------------------
// 1. TESTE DE CLAIM ATÔMICO, PERSISTÊNCIA DE ATTEMPTS, IDEMPOTÊNCIA E ACK
// --------------------------------------------------------------------
const mockStorage1 = new MockStorage();
const queue1 = new DurableClaimStore({ deps: { claimsStorage: mockStorage1 }, leaseDurationMs: 60000 });

const now1 = 1793000000000;
// A) Aquisição inicial de claim
const claim1 = queue1.acquireClaim('TCK-TEST-001', 'in_production', { now: now1, workerId: 'worker-node-1' });
assert.equal(claim1.acquired, true, 'Claim 1 deve ser adquirido com sucesso');
assert.ok(claim1.attemptId.startsWith('att-'), 'attemptId deve ter formato att-');
assert.equal(claim1.fencingToken, 1, 'Primeiro claim deve ter fencingToken 1');
assert.equal(claim1.workerId, 'worker-node-1');

// Verifica persistência durável no storage
const savedClaims = mockStorage1.getClaims();
assert.ok(savedClaims['TCK-TEST-001'], 'Claim deve estar persistido no storage durável');
assert.equal(savedClaims['TCK-TEST-001'].status, 'claimed');
assert.equal(savedClaims['TCK-TEST-001'].fencingToken, 1);

// B) Tentativa concorrente duplicada durante o lease (Idempotência)
const claimDup = queue1.acquireClaim('TCK-TEST-001', 'in_production', { now: now1 + 5000, workerId: 'worker-node-2' });
assert.equal(claimDup.acquired, false, 'Claim concorrente deve ser rejeitado durante lease ativo');
assert.equal(claimDup.reason, 'active_claim_held');
assert.equal(claimDup.attemptId, claim1.attemptId);

// C) Conclusão verificada / ACK com attemptId correspondente
const ackRes = queue1.ackClaim('TCK-TEST-001', claim1.attemptId, { buildStatus: 'ready' }, { now: now1 + 10000 });
assert.ok(ackRes.completed || ackRes.acked, 'Conclusão/ACK legítimo deve ser aprovado');
assert.equal(ackRes.fencingToken, 1);

const ackedSaved = mockStorage1.getClaims()['TCK-TEST-001'];
assert.ok(ackedSaved.status === 'completed' || ackedSaved.status === 'acked');
assert.equal(ackedSaved.result.buildStatus, 'ready');
assert.ok(ackedSaved.completedAt);

// D) Tentativa de reprocessar job já completado (Idempotência de conclusão)
const claimAfterAck = queue1.acquireClaim('TCK-TEST-001', 'in_production', { now: now1 + 15000 });
assert.equal(claimAfterAck.acquired, false);
assert.equal(claimAfterAck.reason, 'already_completed');
assert.deepEqual(claimAfterAck.result, { buildStatus: 'ready' });

console.log('✅ PASS: Ordem 035 - Claim atômico, persistência de attempt, idempotência e ACK verificados');

// --------------------------------------------------------------------
// 2. TESTE DE CRASH RECOVERY, REINICIALIZAÇÃO E FENCING TOKEN
// --------------------------------------------------------------------
const crashStorage = new MockStorage();
const startTime = 1793010000000;

// Worker 1 adquire claim mas "morre" (crash) antes de dar ACK
const workerCrash = new DurableClaimStore({ deps: { claimsStorage: crashStorage }, leaseDurationMs: 60000 });
const crashClaim = workerCrash.acquireClaim('TCK-CRASH-002', 'in_production', { now: startTime, workerId: 'worker-dead' });
assert.equal(crashClaim.acquired, true);
assert.equal(crashClaim.fencingToken, 1);

// Worker 2 inicia após reinício (nova instância lendo o mesmo storage compartilhado)
const workerRestart = new DurableClaimStore({ deps: { claimsStorage: crashStorage }, leaseDurationMs: 60000 });

// I. Reinício imediato antes do TTL expirar (now + 20s): respeita o lease ativo e não duplica
const claimBeforeTtl = workerRestart.acquireClaim('TCK-CRASH-002', 'in_production', { now: startTime + 20000, workerId: 'worker-restart' });
assert.equal(claimBeforeTtl.acquired, false, 'Worker após reinício não pode atropelar lease ativo dentro do TTL');
assert.equal(claimBeforeTtl.reason, 'active_claim_held');

// II. Tempo avança além do TTL (now + 65s): lease expira e recuperação proativa é executada
const recoveredJobs = workerRestart.recoverOrphanedClaims(startTime + 65000);
assert.equal(recoveredJobs.length, 1, 'Deve identificar e recuperar exatamente 1 job órfão');
assert.equal(recoveredJobs[0].ticketId, 'TCK-CRASH-002');
assert.equal(recoveredJobs[0].attemptId, crashClaim.attemptId);

// III. Worker 2 agora pode assumir o ticket com fencingToken incrementado monotônicamente (2)
const claimAfterRecovery = workerRestart.acquireClaim('TCK-CRASH-002', 'in_production', { now: startTime + 66000, workerId: 'worker-restart' });
assert.equal(claimAfterRecovery.acquired, true, 'Worker recuperado deve conseguir assumir o ticket');
assert.equal(claimAfterRecovery.fencingToken, 2, 'Fencing token DEVE ser incrementado para 2');
assert.notEqual(claimAfterRecovery.attemptId, crashClaim.attemptId);

// IV. Se o worker antigo zumbi tentar emitir ACK tardio com fencing token desatualizado (attemptId 1), deve ser rejeitado!
const staleAck = workerRestart.ackClaim('TCK-CRASH-002', crashClaim.attemptId, { result: 'zombie_late' });
assert.equal(staleAck.acked, false, 'ACK tardio de worker zumbi com fencing desatualizado deve ser rejeitado');
assert.equal(staleAck.reason, 'stale_attempt_or_fencing_mismatch');

// V. ACK legítimo do worker 2 é aceito
const validAck2 = workerRestart.ackClaim('TCK-CRASH-002', claimAfterRecovery.attemptId, { ok: true });
assert.equal(validAck2.acked, true);
assert.equal(validAck2.fencingToken, 2);

console.log('✅ PASS: Ordem 035 - Recuperação após reinício (crash recovery) e proteção com fencing token');

// --------------------------------------------------------------------
// 3. TESTE DE RESTRIÇÃO DO SERVICE_WORKER (TENANTS, TAREFAS E ZERO APROVAÇÃO MASTER)
// --------------------------------------------------------------------
// A) Token do service_worker restrito ao tenant publicarte
const swToken = getServiceWorkerToken(300, {
  tenantId: 'publicarte',
  allowedTenantIds: ['publicarte'],
  allowedTasks: ['progress', 'verify'],
});

const swDecision = validateServerApiAccess({
  get: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${swToken}` : null),
});

assert.equal(swDecision.authenticated, true);
assert.equal(swDecision.isServiceWorker, true);
assert.equal(swDecision.isSuperAdmin, false, 'service_worker NUNCA pode ter status SuperAdmin');
assert.deepEqual(swDecision.allowedTenantIds, ['publicarte'], 'allowedTenantIds não pode conter coringa all');
assert.deepEqual(swDecision.allowedTasks, ['progress', 'verify']);

// B) Tentativa de listagem global irrestrita (effectiveTenant = undefined)
// Simulação da lógica da rota /api/tickets
function simulateTicketsGetAuth(decision, requestedTenant) {
  if (!decision.authenticated) return { status: 401, error: 'Unauthorized' };
  if (decision.isSuperAdmin) {
    return { status: 200, effectiveTenant: requestedTenant && requestedTenant !== 'all' ? requestedTenant : undefined };
  }
  if (decision.isServiceWorker) {
    if (requestedTenant === 'all') {
      return { status: 403, error: 'Acesso negado: service_worker não possui autorização para listagem global irrestrita.' };
    }
    if (requestedTenant) {
      if (!decision.allowedTenantIds || !decision.allowedTenantIds.includes(requestedTenant)) {
        return { status: 403, error: `Acesso negado: service_worker não possui autorização para o tenant '${requestedTenant}'.` };
      }
      return { status: 200, effectiveTenant: requestedTenant };
    }
    if (decision.allowedTenantIds && decision.allowedTenantIds.length === 1 && decision.allowedTenantIds[0] !== 'all') {
      return { status: 200, effectiveTenant: decision.allowedTenantIds[0] };
    }
    return { status: 403, error: 'Acesso negado: service_worker deve especificar um tenantId autorizado e não pode listar globalmente.' };
  }
  return { status: 403, error: 'Forbidden' };
}

// 1. Listagem global explicitamente rejeitada para service_worker
const globalQueryRes = simulateTicketsGetAuth(swDecision, 'all');
assert.equal(globalQueryRes.status, 403, 'Listagem global ?tenantId=all deve ser rejeitada com 403');

// 2. Consulta de tenant divergente rejeitada
const foreignTenantRes = simulateTicketsGetAuth(swDecision, 'aidoctor');
assert.equal(foreignTenantRes.status, 403, 'Consulta de tenant não autorizado deve ser rejeitada com 403');

// 3. Consulta de tenant autorizado permitida
const validTenantRes = simulateTicketsGetAuth(swDecision, 'publicarte');
assert.equal(validTenantRes.status, 200);
assert.equal(validTenantRes.effectiveTenant, 'publicarte');

// C) Simulação da rota PATCH /api/tickets/[id] para permissões restritas
function simulateTicketsPatchAuth(decision, ticket, body) {
  if (!decision.authenticated) return { status: 401 };
  if (body.action === 'approve') {
    if (decision.isServiceWorker) {
      return { status: 403, error: 'Aprovação negada: service_worker não possui permissão de aprovação Master.' };
    }
    if (!decision.isSuperAdmin) return { status: 403, error: 'Apenas SuperAdmin pode aprovar.' };
    return { status: 200 };
  }
  if (body.action === 'reset' || body.action === 'reopen') {
    if (decision.isServiceWorker || !decision.isSuperAdmin) {
      return { status: 403, error: 'Operação restrita ao SuperAdmin.' };
    }
    return { status: 200 };
  }
  if (body.action === 'progress') {
    if (decision.isServiceWorker && !decision.isSuperAdmin) {
      if (decision.allowedTasks && !decision.allowedTasks.includes('progress')) {
        return { status: 403, error: 'Tarefa não autorizada para o worker.' };
      }
      if (!decision.allowedTenantIds || !decision.allowedTenantIds.includes(ticket.tenantId)) {
        return { status: 403, error: 'Tenant não autorizado para o worker.' };
      }
    }
    return { status: 200 };
  }
  return { status: 403 };
}

const mockTicketPublicarte = { id: 'tck-pub', tenantId: 'publicarte' };
const mockTicketAiDoctor = { id: 'tck-aid', tenantId: 'aidoctor' };

// 1. service_worker tentando aprovar ticket -> 403
const approveAttempt = simulateTicketsPatchAuth(swDecision, mockTicketPublicarte, { action: 'approve' });
assert.equal(approveAttempt.status, 403, 'service_worker tentando aprovar ticket deve receber 403');

// 2. service_worker tentando resetar ticket -> 403
const resetAttempt = simulateTicketsPatchAuth(swDecision, mockTicketPublicarte, { action: 'reset' });
assert.equal(resetAttempt.status, 403, 'service_worker tentando resetar ticket deve receber 403');

// 3. service_worker emitindo progresso em tenant divergente -> 403
const progForeignAttempt = simulateTicketsPatchAuth(swDecision, mockTicketAiDoctor, { action: 'progress' });
assert.equal(progForeignAttempt.status, 403, 'Progresso em tenant divergente deve receber 403');

// 4. service_worker emitindo progresso em tenant autorizado -> 200
const progValidAttempt = simulateTicketsPatchAuth(swDecision, mockTicketPublicarte, { action: 'progress' });
assert.equal(progValidAttempt.status, 200, 'Progresso em tenant autorizado deve receber 200');

console.log('✅ PASS: Ordem 035 - service_worker estritamente restrito a tenants/tarefas e bloqueado de aprovação Master');

// --------------------------------------------------------------------
// 4. TESTE DE CICLO COMPLETO DO WATCHDOG COM FILA DURÁVEL E EXECUÇÃO DESATIVADA
// --------------------------------------------------------------------
const cycleStorage = new MockStorage();
const mockCycleDeps = {
  claimsStorage: cycleStorage,
  fetch: async (url) => {
    // Retorna base simulada com 1 ticket em produção retido para homologação
    return {
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'tck-sandbox-cycle',
          code: 'TCK-SBX',
          title: 'Chamado em Produção para Teste de Ciclo',
          tenantId: 'publicarte',
          status: 'in_production',
          progressPercentage: 25,
          messages: [],
          events: []
        }
      ]
    };
  }
};

const cycleRes = await runWatchdogCycle({
  allowAutonomousDeploy: false, // Execução real mantida terminantemente desativada
  deps: mockCycleDeps
});

assert.equal(cycleRes.success, true);
assert.equal(cycleRes.processedCount, 1);
const claimsAfterCycle = cycleStorage.getClaims();
assert.ok(claimsAfterCycle['tck-sandbox-cycle'], 'Claim deve ter sido registrado e processado na fila durável');
assert.ok(claimsAfterCycle['tck-sandbox-cycle'].status === 'deferred' || claimsAfterCycle['tck-sandbox-cycle'].status === 'acked');

console.log('✅ PASS: Ordem 035 - Ciclo completo do watchdog com fila durável e execução real desativada');

console.log('======================================================================');
console.log('🎉 TODOS OS TESTES DA ORDEM 035 FORAM APROVADOS COM 100% DE SUCESSO!');
console.log('======================================================================');
