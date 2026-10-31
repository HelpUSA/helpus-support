// scripts/test_order031_architecture.mjs
// Testes de Arquitetura da Ordem 033 (Unificação de Watchers, Leases, Idempotência, Restrições de Service Worker e Persistência)

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  signSessionToken,
  verifySessionToken,
  validateServerApiAccess,
} from '../src/lib/serverAuth.ts';
import {
  getServiceWorkerToken,
  acquireLease,
  releaseLease,
  clearExpiredLeases,
  activeLeases,
  processTicket,
  signTicketEvent,
} from './antigravity_watcher.js';
import { ticketStore, mergeTicketsGranular, INITIAL_TICKETS } from '../src/lib/store.ts';

console.log('======================================================================');
console.log('TESTES DE ARQUITETURA ORDEM 033: WORKER UNIFICADO, LEASES E PERSISTÊNCIA');
console.log('======================================================================');

// --------------------------------------------------------------------
// 1. TESTE DE PRIVILÉGIOS MÍNIMOS E RESTRIÇÃO DE TENANT (SERVICE WORKER)
// --------------------------------------------------------------------
// A) Token global de service worker
const swTokenGlobal = getServiceWorkerToken(300, { tenantId: 'all', allowedTenantIds: ['all'] });
const swAuthGlobal = validateServerApiAccess({
  get: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${swTokenGlobal}` : null),
});

assert.equal(swAuthGlobal.authenticated, true, 'Service worker global deve ser autenticado');
assert.equal(swAuthGlobal.isServiceWorker, true, 'isServiceWorker deve ser true');
assert.equal(swAuthGlobal.isSuperAdmin, false, 'isSuperAdmin DEVE ser estritamente false para service worker');
assert.equal(swAuthGlobal.role, 'service_worker', 'Role deve ser service_worker');
assert.deepEqual(swAuthGlobal.allowedTenantIds, ['all'], 'Service worker global pode consultar fila global');

// B) Token com escopo restrito a tenant específico (menor privilégio)
const swTokenScoped = getServiceWorkerToken(300, { tenantId: 'publicarte', allowedTenantIds: ['publicarte'] });
const swAuthScoped = validateServerApiAccess({
  get: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${swTokenScoped}` : null),
});

assert.equal(swAuthScoped.authenticated, true, 'Service worker restrito deve ser autenticado');
assert.equal(swAuthScoped.isServiceWorker, true);
assert.equal(swAuthScoped.isSuperAdmin, false);
assert.equal(swAuthScoped.tenantId, 'publicarte', 'TenantId deve ser restrito ao escopo do token');
assert.deepEqual(swAuthScoped.allowedTenantIds, ['publicarte'], 'allowedTenantIds deve conter apenas publicarte');

console.log('✅ PASS: Ordem 033 - Token de service_worker autentica com privilégios mínimos e suporte a restrição de tenant');

// --------------------------------------------------------------------
// 2. TESTE DE LEASES E DEDUPLICAÇÃO DE EXECUÇÃO (IDEMPOTÊNCIA E 2 INSTÂNCIAS)
// --------------------------------------------------------------------
activeLeases.clear();

const testTicketId = 'tck-sandbox-ordem033-01';

// Instância 1 adquire o lease
const attempt1 = acquireLease(testTicketId, 'in_production', 5000);
assert.ok(attempt1, 'Instância 1 deve adquirir lease com sucesso');
assert.ok(attempt1.startsWith('att-'), 'AttemptId deve conter prefixo canônico att-');

// Instância 2 tenta adquirir concorrentemente para o mesmo chamado em in_production
const attempt2 = acquireLease(testTicketId, 'in_production', 5000);
assert.equal(attempt2, null, 'Instância 2 concorrente DEVE ser rejeitada (lease ativo suprime duplicatas)');

// Liberação manual pelo worker após processamento
releaseLease(testTicketId);
const attempt3 = acquireLease(testTicketId, 'in_production', 5000);
assert.ok(attempt3, 'Reaquisição após release deve ter sucesso');
assert.notEqual(attempt3, attempt1, 'Novo attemptId deve ser único para garantir fencing');

// Simulação de crash da Instância 1: Lease expira por TTL
const now = Date.now();
acquireLease('tck-crashed-instance', 'in_production', 1000, now - 2000); // Criado 2s atrás com TTL 1s
clearExpiredLeases(now);
assert.equal(activeLeases.has('tck-crashed-instance'), false, 'Lease de worker travado/crashado deve expirar permitindo recuperação');

const recoveredAttempt = acquireLease('tck-crashed-instance', 'in_production', 5000, now);
assert.ok(recoveredAttempt, 'Worker substituto recupera e processa o chamado após expiração do lease');

console.log('✅ PASS: Ordem 033 - Controle de leases entre instâncias concorrentes, idempotência e recuperação após crash');

// --------------------------------------------------------------------
// 3. TESTE DE PERSISTÊNCIA DURÁVEL (SEM RESET PARA PENDING_APPROVAL NO F5 E CAS 409)
// --------------------------------------------------------------------
const mockAid101Local = {
  id: 'tck-1792960000000',
  code: 'AID-101',
  tenantId: 'aidoctor',
  tenantName: 'AIDoctor',
  title: 'Retire o texto circulado na imagem em anexo',
  description: 'Solicitação para remoção de badges CRM',
  category: 'feature',
  priority: 'high',
  status: 'in_production',
  progressPercentage: 75,
  progressStep: 'Compilando projeto...',
  createdByEmail: 'helpus.ecommerce@gmail.com',
  createdByName: 'SuperAdmin HelpUS',
  createdAt: '2026-10-25T17:30:00.000Z',
  updatedAt: new Date().toISOString(),
  messages: [
    {
      id: 'msg-aid-001',
      ticketId: 'tck-1792960000000',
      senderId: 'helpus.ecommerce@gmail.com',
      senderName: 'SuperAdmin HelpUS',
      senderRole: 'client',
      isInternalNote: false,
      content: 'Solicitação original',
      createdAt: '2026-10-25T17:30:00.000Z',
    },
  ],
  events: [],
};

// Rehidrata store com o estado local
ticketStore.rehydrateTicket(mockAid101Local);

// Simulação de resposta remota (GitHub Cloud) que NÃO possui AID-101
const mockCloudTickets = [
  {
    id: 'tck-1791240000000',
    code: 'USM-120',
    tenantId: 'usmle',
    tenantName: 'USMLE Platform',
    title: 'Falha de Login Google',
    status: 'resolved',
    createdAt: '2026-10-12T01:50:00.000Z',
  },
];

// Teste de merge granular (compatibilidade estrita com método de instância e função)
const mergedFromFunction = mergeTicketsGranular(mockCloudTickets, [mockAid101Local]);
const mergedFromInstance = ticketStore.mergeTicketsGranular(mockCloudTickets, [mockAid101Local]);

assert.equal(mergedFromFunction.length, 2, 'Merge granular deve reter ambos os tickets');
assert.equal(mergedFromInstance.length, 2, 'Método de instância deve produzir resultado idêntico');

const aid101AfterSync = mergedFromInstance.find((t) => t.id === 'tck-1792960000000');
assert.ok(aid101AfterSync, 'AID-101 DEVE ser preservado após sync com nuvem');
assert.equal(aid101AfterSync.status, 'in_production', 'Status DEVE permanecer in_production e NÃO voltar para pending_approval');
assert.equal(aid101AfterSync.progressPercentage, 75, 'Progresso 75% deve ser preservado');

// Teste de Conflito CAS 409 com reconciliação: Mensagem remota concorrente adicionada
const concurrentCloudTickets = [
  {
    ...mockAid101Local,
    messages: [
      ...mockAid101Local.messages,
      {
        id: 'msg-remote-concurrent',
        ticketId: 'tck-1792960000000',
        senderId: 'client@helpusbr.com',
        senderName: 'Cliente Concorrente',
        senderRole: 'client',
        content: 'Mensagem enviada simultaneamente',
        createdAt: '2026-10-25T18:00:00.000Z',
      },
    ],
  },
];

const reconciledTickets = ticketStore.mergeTicketsGranular(concurrentCloudTickets, [mockAid101Local]);
const reconciledAid101 = reconciledTickets.find((t) => t.id === 'tck-1792960000000');
assert.equal(reconciledAid101.messages.length, 2, 'Reconciliação CAS deve preservar mensagens locais e remotas concorrentes sem perda');

console.log('✅ PASS: Ordem 033 - Persistência durável preserva AID-101 (sem reset no F5) e resolve conflito CAS 409');

// --------------------------------------------------------------------
// 4. TESTE DE PROGRESSO BASEADO EM EVIDÊNCIA (SEM TELEMETRIA ARTIFICIAL)
// --------------------------------------------------------------------
const sandboxTicket = {
  id: 'tck-sandbox-test-evidence',
  code: 'TCK-SANDBOX-TEST',
  tenantId: 'publicarte',
  title: 'Validação de Telemetria com Evidência Verificável',
  description: 'Teste automatizado de execução verificável',
  category: 'sandbox_test',
  priority: 'low',
  status: 'in_production',
  progressPercentage: 0,
  createdByEmail: 'ci.cd@helpusbr.com',
  createdAt: new Date().toISOString(),
};

// Teste A: Chamado sem commit comprovado DEVE parar em 25% (Hold) e rejeitar telemetria fictícia
const mockFetchForHold = async (url, options = {}) => {
  if (url.includes('/contents/')) {
    if (!options.method || options.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: 'sha-hold-111',
          content: Buffer.from(JSON.stringify([sandboxTicket])).toString('base64')
        })
      };
    }
    if (options.method === 'PUT') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: { sha: 'sha-hold-222' } })
      };
    }
  }
  if (url.includes('/commits/')) {
    return { ok: false, status: 404 }; // Commit ainda não realizado no repositório
  }
  return { ok: false, status: 500 };
};

const holdResult = await processTicket(
  sandboxTicket,
  { dryRun: false, allowAutonomousDeploy: true },
  {
    fetch: mockFetchForHold,
    githubToken: 'gh_test_mock_token',
  }
);

assert.equal(holdResult.step, 25, 'Sem commit real verificado, chamado DEVE parar no step 25%');
assert.equal(holdResult.status, 'in_production', 'Status deve permanecer in_production (aguardando código)');
assert.ok(holdResult.note.includes('código real') || holdResult.note.includes('Aguardando'), 'Nota deve explicitar retenção por ausência de commit');

console.log('✅ PASS: Ordem 033 - Telemetria artificial eliminada; retenção verificável em 25% sem commit falso');

// Teste B: Chamado com commit comprovado e deploy READY avança legitimamente para 100%
const verifiedSha = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
const mockFetchForResolved = async (url, options = {}) => {
  if (url.includes('/contents/')) {
    if (!options.method || options.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: 'sha-res-111',
          content: Buffer.from(JSON.stringify([{
            ...sandboxTicket,
            adminNotes: `Commit: ${verifiedSha}`
          }])).toString('base64')
        })
      };
    }
    if (options.method === 'PUT') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: { sha: 'sha-res-222' } })
      };
    }
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const verifiedResult = await processTicket(
  {
    ...sandboxTicket,
    solutionCommitSha: verifiedSha,
    adminNotes: `Commit: ${verifiedSha}`,
  },
  { dryRun: false, allowAutonomousDeploy: true, verifiedSha, deployHook: 'https://api.vercel.com/v1/integrations/deploy/mock-test' },
  {
    fetch: mockFetchForResolved,
    githubToken: 'gh_test_mock_token',
    verifyCommitFn: async () => ({ valid: true, fullSha: verifiedSha }),
    verifyDeploymentFn: async () => ({ ready: true, deploymentId: 'dpl_mock_ready', target: 'production', name: 'publicarte' }),
  }
);

assert.equal(verifiedResult.step, 100, 'Com commit e deploy verificados, avança com evidência para 100%');
assert.equal(verifiedResult.status, 'resolved', 'Status deve ser legitimamente resolvido');
assert.ok(verifiedResult.deployment, 'Resultado deve incluir comprovação de deployment');
assert.equal(verifiedResult.deployment.ready, true, 'Deployment deve estar comprovadamente READY');

console.log('✅ PASS: Ordem 033 - Execução verificada avança para 100% com recibos e evidência canônica');

console.log('======================================================================');
console.log('🎉 TODOS OS TESTES DA ORDEM 033 APROVADOS COM 100% DE SUCESSO!');
console.log('======================================================================');
