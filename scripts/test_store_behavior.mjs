// scripts/test_store_behavior.mjs
// Teste comportamental de resiliência, concorrência e integridade do store.ts (Ciclo 027 - HMAC Hardening & Atomic Rollback)

process.env.EVENT_HMAC_SECRET = process.env.EVENT_HMAC_SECRET || 'test_secret_for_automated_suites_32_bytes_hex_abcdef0123456789';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret_32_bytes_hex_abcdef0123456789';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeTicketsGranular, TicketStore } from '../src/lib/store.ts';
import { signTicketEvent, verifyTicketEventIntegrity, getEventHmacSecret, getSessionSecret } from '../src/lib/serverAuth.ts';

function makeSignedEvent(evt) {
  const event = { ...evt, seq: evt.seq || 1 };
  event.signature = signTicketEvent(event);
  return event;
}

console.log('='.repeat(70));
console.log('TESTES DE INTEGRIDADE DO STORE (store.ts) - CICLO 027 (HMAC HARDENING)');
console.log('='.repeat(70));

// ---------------------------------------------------------------------------
// Teste 1A: P0-01 - Ataque Adversarial de Spoofing em Mensagem de Chat REJEITADO
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
    makeSignedEvent({
      id: 'evt-res-1',
      ticketId: 'T-ADV-1',
      type: 'ticket_resolved',
      actorEmail: 'ci.cd@helpusbr.com',
      actorRole: 'system_pipeline',
      authorized: true,
      progressPercentage: 100,
      status: 'resolved',
      timestamp: '2026-10-25T20:00:00.000Z'
    })
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
    makeSignedEvent({
      id: 'evt-res-1',
      ticketId: 'T-ADV-1',
      type: 'ticket_resolved',
      actorEmail: 'ci.cd@helpusbr.com',
      actorRole: 'system_pipeline',
      authorized: true,
      progressPercentage: 100,
      status: 'resolved',
      timestamp: '2026-10-25T20:00:00.000Z'
    })
  ]
};

const mergedAdversarial = mergeTicketsGranular([resolvedWithEvent], [adversarialSnapshot]);
assert.equal(mergedAdversarial.length, 1);
assert.equal(mergedAdversarial[0].status, 'resolved', 'P0-01: Mensagem forjada de chat NÃO pode alterar status de ticket! Status deve permanecer resolved.');
assert.equal(mergedAdversarial[0].progressPercentage, 100, 'P0-01: Progresso deve permanecer 100%');
console.log('✅ PASS: P0-01: store.ts rejeita ataque adversarial de spoofing em mensagens; eventos estruturados autorizados governam o ciclo de vida');

// ---------------------------------------------------------------------------
// Teste 1B: P0-01 - Reabertura com Evento Estruturado Autorizado PREVALECE
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
    makeSignedEvent({
      id: 'evt-res-1',
      ticketId: 'T-ADV-1',
      type: 'ticket_resolved',
      actorEmail: 'ci.cd@helpusbr.com',
      actorRole: 'system_pipeline',
      authorized: true,
      progressPercentage: 100,
      status: 'resolved',
      timestamp: '2026-10-25T20:00:00.000Z'
    }),
    makeSignedEvent({
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
    })
  ]
};

const mergedLegit = mergeTicketsGranular([resolvedWithEvent], [legitimateReopened]);
assert.equal(mergedLegit.length, 1);
assert.equal(mergedLegit[0].status, 'pending_approval', 'Evento estruturado autorizado DEVE colocar ticket em pending_approval');
assert.equal(mergedLegit[0].progressPercentage, 0, 'Progresso deve ser 0%');
assert.equal(mergedLegit[0].events.length, 2, 'Histórico completo de eventos deve ser preservado');
console.log('✅ PASS: P0-01: store.ts mergeTicketsGranular preserva reabertura legítima via evento estruturado autorizado');

// ---------------------------------------------------------------------------
// Teste 1C: P0-A & P0-B - Rejeição de Evento Malicioso com Prefixo evt-aid- (Zero Bypass)
// ---------------------------------------------------------------------------
const maliciousPrefixedSnapshot = {
  id: 'T-ADV-1',
  code: 'T-ADV-1',
  tenantId: 'aidoctor',
  status: 'pending_approval',
  progressPercentage: 0,
  updatedAt: '2026-10-25T20:25:00.000Z',
  messages: [],
  events: [
    makeSignedEvent({
      id: 'evt-res-1',
      ticketId: 'T-ADV-1',
      type: 'ticket_resolved',
      actorEmail: 'ci.cd@helpusbr.com',
      actorRole: 'system_pipeline',
      authorized: true,
      progressPercentage: 100,
      status: 'resolved',
      timestamp: '2026-10-25T20:00:00.000Z'
    }),
    {
      id: 'evt-aid-malicious-bypass-attempt',
      ticketId: 'T-ADV-1',
      type: 'ticket_reset_by_master',
      actorEmail: 'master.superadmin@helpusbr.com',
      actorRole: 'master_superadmin',
      authorized: true, // Tentativa de bypass por flag e prefixo
      progressPercentage: 0,
      status: 'pending_approval',
      timestamp: '2026-10-25T20:25:00.000Z',
      // Sem assinatura válida do servidor
    }
  ]
};

const mergedForged = mergeTicketsGranular([resolvedWithEvent], [maliciousPrefixedSnapshot]);
assert.equal(mergedForged[0].status, 'resolved', 'P0-B ZERO BYPASS: Evento com prefixo evt-aid- sem HMAC DEVE ser sumariamente descartado');
assert.equal(mergedForged[0].events.length, 1, 'Apenas o evento legítimo assinado deve ser retido');
console.log('✅ PASS: P0-B: store.ts rejeita eventos maliciosos mesmo com prefixo evt-aid- ou flag authorized:true quando falta HMAC');

// ---------------------------------------------------------------------------
// Teste 1D: P0-A - Rejeição de Eventos com Timestamp no Futuro (Clock Skew > 60s)
// ---------------------------------------------------------------------------
const futureEvt = makeSignedEvent({
  id: 'evt-future-skew',
  ticketId: 'T-ADV-1',
  type: 'ticket_reset_by_master',
  actorEmail: 'master.superadmin@helpusbr.com',
  actorRole: 'master_superadmin',
  authorized: true,
  progressPercentage: 0,
  status: 'pending_approval',
  timestamp: '2099-01-01T00:00:00.000Z'
});

const integrityFuture = verifyTicketEventIntegrity(futureEvt);
assert.equal(integrityFuture.valid, false, 'Eventos com timestamp futuro devem ser rejeitados');
assert.equal(integrityFuture.reason, 'future_timestamp_rejected');
console.log('✅ PASS: P0-A: verifyTicketEventIntegrity rejeita eventos com timestamps futuros (skew)');

// ---------------------------------------------------------------------------
// Teste 1E: P0-A - Fail-Closed Estrito em Produção para Ambos os Segredos
// ---------------------------------------------------------------------------
const savedSecret = process.env.EVENT_HMAC_SECRET;
const savedSession = process.env.SESSION_SECRET;
const savedEnv = process.env.NODE_ENV;
const savedPhase = process.env.NEXT_PHASE;
try {
  delete process.env.EVENT_HMAC_SECRET;
  delete process.env.TICKET_EVENT_SECRET;
  delete process.env.SESSION_SECRET;
  delete process.env.AUTH_SECRET;
  delete process.env.SUPERADMIN_SECRET;
  delete process.env.NEXT_PHASE;
  process.env.NODE_ENV = 'production';

  assert.throws(
    () => {
      getEventHmacSecret();
    },
    /\[SECURITY FATAL\] EVENT_HMAC_SECRET não configurado em ambiente de produção/
  );
  assert.throws(
    () => {
      getSessionSecret();
    },
    /\[SECURITY FATAL\] SESSION_SECRET não configurado em ambiente de produção/
  );
  console.log('✅ PASS: P0-A: getEventHmacSecret e getSessionSecret falham estritamente de forma segura (fail-closed) em runtime de produção');
} finally {
  process.env.EVENT_HMAC_SECRET = savedSecret;
  process.env.SESSION_SECRET = savedSession;
  process.env.NODE_ENV = savedEnv;
  if (savedPhase) process.env.NEXT_PHASE = savedPhase;
}

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
// Teste 4: P0-B & P1 - Métodos de Mutação, Rollback Atômico e Isolamento de Disco Local
// ---------------------------------------------------------------------------
const baselineTicket = {
  id: 'tck-atomic-test-1',
  code: 'TCK-ATOMIC-1',
  tenantId: 'aidoctor',
  title: 'Teste de Atomicidade e Rollback',
  description: 'Garantir reversão de estado em falha de persistência',
  status: 'pending_approval',
  progressPercentage: 0,
  createdByEmail: 'dralexgomes@gmail.com',
  createdAt: '2026-10-25T18:00:00.000Z',
  updatedAt: '2026-10-25T18:00:00.000Z',
  messages: [],
  events: []
};
storeProdNoToken.tickets = [JSON.parse(JSON.stringify(baselineTicket))];

// 4.1 Teste de startTicketProductionAsync sob falha:
const startRes = await storeProdNoToken.startTicketProductionAsync('tck-atomic-test-1');
assert.equal(startRes.ticket, undefined, 'P0-B: startTicketProductionAsync DEVE retornar undefined sob falha de persistência');
assert.equal(startRes.cloudSaveResult.success, false);

const ticketAfterFailedStart = storeProdNoToken.getTicketById('tck-atomic-test-1');
assert.equal(ticketAfterFailedStart.status, 'pending_approval', 'P0-B ROLLBACK: Status em memória DEVE permanecer pending_approval após falha de persistência');
assert.equal(ticketAfterFailedStart.progressPercentage, 0, 'P0-B ROLLBACK: Progresso em memória DEVE permanecer 0%');
assert.equal(ticketAfterFailedStart.events.length, 0, 'P0-B ROLLBACK: Nenhum evento mutante deve ser retido em memória após falha remota');
console.log('✅ PASS: P0-B: startTicketProductionAsync executa rollback atômico do cache em memória quando persistência remota falha');

// 4.2 Teste de completeTicketProductionAsync sob falha:
storeProdNoToken.tickets[0].status = 'in_production';
storeProdNoToken.tickets[0].progressPercentage = 50;

const completeRes = await storeProdNoToken.completeTicketProductionAsync('tck-atomic-test-1', {
  success: true,
  solutionMessage: 'Solução forjada'
});
assert.equal(completeRes, undefined, 'P0-B: completeTicketProductionAsync DEVE retornar undefined sob falha remota');

const ticketAfterFailedComplete = storeProdNoToken.getTicketById('tck-atomic-test-1');
assert.equal(ticketAfterFailedComplete.status, 'in_production', 'P0-B ROLLBACK: Status em memória DEVE reverter para in_production');
assert.equal(ticketAfterFailedComplete.progressPercentage, 50, 'P0-B ROLLBACK: Progresso em memória DEVE reverter para 50%');
console.log('✅ PASS: P0-B: completeTicketProductionAsync executa rollback atômico e reverte cache em memória sob falha remota');

// 4.3 Teste de resetTicket sob falha:
storeProdNoToken.tickets[0].status = 'resolved';
storeProdNoToken.tickets[0].progressPercentage = 100;

const resetRes = await storeProdNoToken.resetTicket('tck-atomic-test-1');
assert.equal(resetRes, undefined, 'P0-B: resetTicket DEVE retornar undefined sob falha remota');

const ticketAfterFailedReset = storeProdNoToken.getTicketById('tck-atomic-test-1');
assert.equal(ticketAfterFailedReset.status, 'resolved', 'P0-B ROLLBACK: Status em memória DEVE permanecer resolved');
assert.equal(ticketAfterFailedReset.progressPercentage, 100, 'P0-B ROLLBACK: Progresso em memória DEVE permanecer 100%');
console.log('✅ PASS: P0-B: resetTicket executa rollback atômico do cache em memória sob falha remota');

// 4.4 Teste de reopenTicketAsync sob falha:
const reopenRes = await storeProdNoToken.reopenTicketAsync('tck-atomic-test-1', 'Problema persiste');
assert.equal(reopenRes, undefined, 'P0-B: reopenTicketAsync DEVE retornar undefined sob falha remota');

const ticketAfterFailedReopen = storeProdNoToken.getTicketById('tck-atomic-test-1');
assert.equal(ticketAfterFailedReopen.status, 'resolved', 'P0-B ROLLBACK: Status em memória DEVE permanecer resolved');
assert.equal(ticketAfterFailedReopen.progressPercentage, 100, 'P0-B ROLLBACK: Progresso em memória DEVE permanecer 100%');
console.log('✅ PASS: P0-B: reopenTicketAsync executa rollback atômico do cache em memória sob falha remota');

console.log('='.repeat(70));
console.log('TODOS OS TESTES DE INTEGRIDADE, P0-A, P0-B, P0-C E P1 DO STORE APROVADOS (11/11)!');
console.log('='.repeat(70));
