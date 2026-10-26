// scripts/test_store_behavior.mjs
// Teste comportamental de resiliência, concorrência e integridade do store.ts (Quinta Auditoria)

import assert from 'node:assert/strict';
import { mergeTicketsGranular, TicketStore } from '../src/lib/store.ts';

console.log('='.repeat(70));
console.log('TESTES DE INTEGRIDADE DO STORE (store.ts) - QUINTA AUDITORIA');
console.log('='.repeat(70));

// ---------------------------------------------------------------------------
// Teste 1A: P0-01 Quinta Auditoria - Ataque Adversarial de Spoofing em Mensagem de Chat REJEITADO
// ---------------------------------------------------------------------------
const resolvedWithEvent = {
  id: 'T-ADV-1',
  code: 'T-ADV-1',
  tenantId: 'aidoctor',
  status: 'resolved',
  progressPercentage: 100,
  updatedAt: '2026-10-25T20:00:00.000Z',
  messages: [
    { id: 'msg-res', senderRole: 'system', content: '✨ [CONCLUÍDO & RESOLVIDO]: Finalizado', createdAt: '2026-10-25T20:00:00.000Z' }
  ],
  events: [
    {
      id: 'evt-res-1',
      ticketId: 'T-ADV-1',
      type: 'ticket_resolved',
      actorEmail: 'ci.cd@helpusbr.com',
      actorRole: 'system_pipeline',
      authorized: true,
      progressPercentage: 100,
      status: 'resolved',
      timestamp: '2026-10-25T20:00:00.000Z'
    }
  ]
};

// Atacante envia mensagem de chat com timestamp mais recente forjando texto de reabertura e remetente Master
const adversarialSnapshot = {
  id: 'T-ADV-1',
  code: 'T-ADV-1',
  tenantId: 'aidoctor',
  status: 'pending_approval', // Forjado no cliente
  progressPercentage: 0,
  updatedAt: '2026-10-25T20:15:00.000Z', // Mais recente
  messages: [
    { id: 'msg-res', senderRole: 'system', content: '✨ [CONCLUÍDO & RESOLVIDO]: Finalizado', createdAt: '2026-10-25T20:00:00.000Z' },
    {
      id: 'msg-reset-spoofed',
      senderId: 'master.superadmin@helpusbr.com', // Spoofed
      senderRole: 'client',
      content: "🔄 Chamado retornado para 'pending_approval' pelo Master SuperAdmin. Todo o histórico anterior foi integralmente preservado.",
      createdAt: '2026-10-25T20:15:00.000Z'
    }
  ],
  events: [
    // Sem nenhum TicketEvent autorizado de reset/reabertura pelo servidor!
    {
      id: 'evt-res-1',
      ticketId: 'T-ADV-1',
      type: 'ticket_resolved',
      actorEmail: 'ci.cd@helpusbr.com',
      actorRole: 'system_pipeline',
      authorized: true,
      progressPercentage: 100,
      status: 'resolved',
      timestamp: '2026-10-25T20:00:00.000Z'
    }
  ]
};

const mergedAdversarial = mergeTicketsGranular([resolvedWithEvent], [adversarialSnapshot]);
assert.equal(mergedAdversarial.length, 1);
assert.equal(mergedAdversarial[0].status, 'resolved', 'P0-01: Mensagem forjada de chat NÃO pode alterar status de ticket! Status deve permanecer resolved.');
assert.equal(mergedAdversarial[0].progressPercentage, 100, 'P0-01: Progresso deve permanecer 100%');
console.log('✅ PASS: P0-01: store.ts rejeita ataque adversarial de spoofing em mensagens; eventos estruturados autorizados governam o ciclo de vida');

// ---------------------------------------------------------------------------
// Teste 1B: P0-01 Quinta Auditoria - Reabertura com Evento Estruturado Autorizado PREVALECE
// ---------------------------------------------------------------------------
const legitimateReopened = {
  id: 'T-ADV-1',
  code: 'T-ADV-1',
  tenantId: 'aidoctor',
  status: 'pending_approval',
  progressPercentage: 0,
  updatedAt: '2026-10-25T20:20:00.000Z',
  messages: [
    { id: 'msg-res', senderRole: 'system', content: '✨ [CONCLUÍDO & RESOLVIDO]: Finalizado', createdAt: '2026-10-25T20:00:00.000Z' },
    { id: 'msg-reset-legit', senderRole: 'system', content: "🔄 Chamado retornado para 'pending_approval' pelo Master SuperAdmin.", createdAt: '2026-10-25T20:20:00.000Z' }
  ],
  events: [
    {
      id: 'evt-res-1',
      ticketId: 'T-ADV-1',
      type: 'ticket_resolved',
      actorEmail: 'ci.cd@helpusbr.com',
      actorRole: 'system_pipeline',
      authorized: true,
      progressPercentage: 100,
      status: 'resolved',
      timestamp: '2026-10-25T20:00:00.000Z'
    },
    {
      id: 'evt-reset-legit',
      ticketId: 'T-ADV-1',
      type: 'ticket_reset_by_master',
      actorEmail: 'master.superadmin@helpusbr.com',
      actorRole: 'master_superadmin',
      authorized: true,
      progressPercentage: 0,
      status: 'pending_approval',
      note: 'Reabertura legítima autorizada pelo Master',
      timestamp: '2026-10-25T20:20:00.000Z'
    }
  ]
};

const mergedLegit = mergeTicketsGranular([resolvedWithEvent], [legitimateReopened]);
assert.equal(mergedLegit.length, 1);
assert.equal(mergedLegit[0].status, 'pending_approval', 'Evento estruturado autorizado DEVE colocar ticket em pending_approval');
assert.equal(mergedLegit[0].progressPercentage, 0, 'Progresso deve ser 0%');
assert.equal(mergedLegit[0].events.length, 2, 'Histórico completo de eventos deve ser preservado');
console.log('✅ PASS: P0-01: store.ts mergeTicketsGranular preserva reabertura legítima via evento estruturado autorizado');

// ---------------------------------------------------------------------------
// Teste 1C: P0-01 Quinta Auditoria - Evento Estruturado NÃO AUTORIZADO (authorized: false) IGNORADO
// ---------------------------------------------------------------------------
const unauthorizedEventSnapshot = {
  id: 'T-ADV-1',
  code: 'T-ADV-1',
  tenantId: 'aidoctor',
  status: 'pending_approval',
  progressPercentage: 0,
  updatedAt: '2026-10-25T20:25:00.000Z',
  messages: [],
  events: [
    {
      id: 'evt-res-1',
      ticketId: 'T-ADV-1',
      type: 'ticket_resolved',
      actorEmail: 'ci.cd@helpusbr.com',
      actorRole: 'system_pipeline',
      authorized: true,
      progressPercentage: 100,
      status: 'resolved',
      timestamp: '2026-10-25T20:00:00.000Z'
    },
    {
      id: 'evt-fake-reset',
      ticketId: 'T-ADV-1',
      type: 'ticket_reset_by_master',
      actorEmail: 'attacker@evil.com',
      actorRole: 'client',
      authorized: false, // Não autorizado pelo servidor
      progressPercentage: 0,
      status: 'pending_approval',
      timestamp: '2026-10-25T20:25:00.000Z'
    }
  ]
};

const mergedUnauthorized = mergeTicketsGranular([resolvedWithEvent], [unauthorizedEventSnapshot]);
assert.equal(mergedUnauthorized[0].status, 'resolved', 'Evento com authorized: false deve ser sumariamente ignorado pelo reconciliador');
console.log('✅ PASS: P0-01: store.ts reconciliador ignora eventos sem autorização comprovada (authorized: false)');

// ---------------------------------------------------------------------------
// Teste 2: saveAsync rejeita falso sucesso se persistência compartilhada em nuvem falhar
// ---------------------------------------------------------------------------
process.env.GITHUB_TOKEN = 'ghp_mock_invalid_token_forces_failure';
process.env.HELPUS_DB_REPO = 'HelpUSA/non_existent_repo_forces_failure_404';

const store = new TicketStore();
const saveResult = await store.saveAsync();

assert.equal(saveResult.success, false, 'saveAsync deve falhar se o GitHub Cloud falhar, mesmo que o arquivo local /tmp tenha sido gravado');
console.log('✅ PASS: store.ts saveAsync rejeita falso sucesso quando persistência compartilhada falha');

// ---------------------------------------------------------------------------
// Teste 3: P0-C - saveAsync em ambiente de produção/Vercel sem token compartilhado DEVE FALHAR
// ---------------------------------------------------------------------------
process.env.GITHUB_TOKEN = '';
process.env.GH_TOKEN = '';
process.env.VERCEL = '1';

const storeProdNoToken = new TicketStore();
const prodNoTokenResult = await storeProdNoToken.saveAsync();

assert.equal(prodNoTokenResult.success, false, 'Em ambiente Vercel, saveAsync DEVE FALHAR se o backend compartilhado não estiver configurado');
assert.equal(prodNoTokenResult.error, 'SHARED_BACKEND_UNAVAILABLE_IN_PRODUCTION');
console.log('✅ PASS: P0-C: store.ts saveAsync falha explicitamente em ambiente Vercel sem backend durável compartilhado');

// ---------------------------------------------------------------------------
// Teste 4: P0-02 Quinta Auditoria - Métodos de Mutação Propagam Falha de Persistência (Retornam undefined)
// ---------------------------------------------------------------------------
// Em ambiente de produção sem backend durável configurado:
const resetRes = await storeProdNoToken.resetTicket('tck-1792960000000');
assert.equal(resetRes, undefined, 'P0-02: resetTicket DEVE retornar undefined quando saveAsync falhar, para que a rota retorne HTTP 500');

const reopenRes = await storeProdNoToken.reopenTicketAsync('tck-1792960000000', 'Problema persiste');
assert.equal(reopenRes, undefined, 'P0-02: reopenTicketAsync DEVE retornar undefined quando saveAsync falhar');

const startProdRes = await storeProdNoToken.startTicketProductionAsync('tck-1792960000000');
assert.equal(startProdRes.ticket, undefined, 'P0-02: startTicketProductionAsync DEVE retornar ticket: undefined quando saveAsync falhar');
assert.equal(startProdRes.cloudSaveResult.success, false, 'cloudSaveResult.success DEVE ser false');

const completeRes = await storeProdNoToken.completeTicketProductionAsync('tck-1792960000000', {
  success: true,
  solutionMessage: 'Solução concluída'
});
assert.equal(completeRes, undefined, 'P0-02: completeTicketProductionAsync DEVE retornar undefined quando saveAsync falhar');

console.log('✅ PASS: P0-02: Todos os métodos de mutação (reset, reopen, start, complete) propagam falha e retornam undefined sob indisponibilidade de persistência');

console.log('='.repeat(70));
console.log('TODOS OS TESTES DE INTEGRIDADE DO STORE FORAM APROVADOS COM SUCESSO (6/6)!');
console.log('='.repeat(70));
