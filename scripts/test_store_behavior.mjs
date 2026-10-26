// scripts/test_store_behavior.mjs
// Teste comportamental de resiliência, concorrência e integridade do store.ts (Quarta Auditoria)

import assert from 'node:assert/strict';

// Teste direto da lógica de reconciliação granular exportada
import { mergeTicketsGranular, TicketStore } from '../src/lib/store.ts';

console.log('='.repeat(70));
console.log('TESTES DE INTEGRIDADE DO STORE (store.ts) - QUARTA AUDITORIA');
console.log('='.repeat(70));

// Teste 1: P0 Quarta Auditoria - Reabertura legítima de resolved para pending_approval prevalece
const resolvedSnapshot = {
  id: 'T-CAS-1',
  code: 'T-CAS-1',
  tenantId: 'aidoctor',
  status: 'resolved',
  progressPercentage: 100,
  updatedAt: '2026-10-25T20:00:00.000Z',
  messages: [
    { id: 'msg-res', senderRole: 'system', content: '✨ [CONCLUÍDO & RESOLVIDO]: Finalizado', createdAt: '2026-10-25T20:00:00.000Z' }
  ]
};

const reopenedSnapshot = {
  id: 'T-CAS-1',
  code: 'T-CAS-1',
  tenantId: 'aidoctor',
  status: 'pending_approval',
  progressPercentage: 0,
  updatedAt: '2026-10-25T20:10:00.000Z',
  messages: [
    { id: 'msg-res', senderRole: 'system', content: '✨ [CONCLUÍDO & RESOLVIDO]: Finalizado', createdAt: '2026-10-25T20:00:00.000Z' },
    { id: 'msg-reset-99', senderRole: 'system', content: "🔄 Chamado retornado para 'pending_approval' pelo Master SuperAdmin.", createdAt: '2026-10-25T20:10:00.000Z' }
  ]
};

const mergedReopen = mergeTicketsGranular([resolvedSnapshot], [reopenedSnapshot]);
assert.equal(mergedReopen.length, 1);
assert.equal(mergedReopen[0].status, 'pending_approval', 'Reabertura de resolved para pending_approval DEVE prevalecer');
assert.equal(mergedReopen[0].progressPercentage, 0, 'Progresso na reabertura DEVE ser 0');
assert.equal(mergedReopen[0].messages.length, 2, 'Histórico completo de mensagens deve ser mantido');

console.log('✅ PASS: P0: store.ts mergeTicketsGranular preserva reabertura autorizada de resolved para pending_approval (0%)');

// Teste 2: saveAsync rejeita falso sucesso se persistência compartilhada em nuvem falhar
process.env.GITHUB_TOKEN = 'ghp_mock_invalid_token_forces_failure';
process.env.HELPUS_DB_REPO = 'HelpUSA/non_existent_repo_forces_failure_404';

const store = new TicketStore();
const saveResult = await store.saveAsync();

assert.equal(saveResult.success, false, 'saveAsync deve falhar se o GitHub Cloud falhar, mesmo que o arquivo local /tmp tenha sido gravado');
console.log('✅ PASS: store.ts saveAsync rejeita falso sucesso quando persistência compartilhada falha');

// Teste 3: P0-C - saveAsync em ambiente de produção/Vercel sem token compartilhado DEVE FALHAR
process.env.GITHUB_TOKEN = '';
process.env.GH_TOKEN = '';
process.env.VERCEL = '1';

const storeProdNoToken = new TicketStore();
const prodNoTokenResult = await storeProdNoToken.saveAsync();

assert.equal(prodNoTokenResult.success, false, 'Em ambiente Vercel, saveAsync DEVE FALHAR se o backend compartilhado não estiver configurado');
assert.equal(prodNoTokenResult.error, 'SHARED_BACKEND_UNAVAILABLE_IN_PRODUCTION');
console.log('✅ PASS: P0-C: store.ts saveAsync falha explicitamente em ambiente Vercel sem backend durável compartilhado');

console.log('='.repeat(70));
console.log('TODOS OS TESTES DE INTEGRIDADE DO STORE FORAM APROVADOS (3/3)!');
console.log('='.repeat(70));
