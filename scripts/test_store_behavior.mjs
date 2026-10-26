// scripts/test_store_behavior.mjs
// Teste comportamental de resiliência, concorrência e integridade do store.ts (P0-C / P1)

import assert from 'node:assert/strict';

// Teste direto da lógica de reconciliação granular exportada
import { mergeTicketsGranular, TicketStore } from '../src/lib/store.ts';

console.log('='.repeat(70));
console.log('TESTES DE INTEGRIDADE DO STORE (store.ts)');
console.log('='.repeat(70));

// Teste 1: Reconciliação sem perda de mensagens concorrentes e preservação de status
const remoteTickets = [
  {
    id: 'T-CAS-1',
    code: 'T-CAS-1',
    tenantId: 'aidoctor',
    status: 'pending_approval',
    updatedAt: '2026-10-25T20:10:00.000Z',
    messages: [
      { id: 'msg-remote', senderRole: 'client', content: 'Mensagem remota', createdAt: '2026-10-25T20:00:00.000Z' }
    ]
  }
];

const localTickets = [
  {
    id: 'T-CAS-1',
    code: 'T-CAS-1',
    tenantId: 'aidoctor',
    status: 'in_production',
    updatedAt: '2026-10-25T20:05:00.000Z',
    messages: [
      { id: 'msg-local', senderRole: 'agent', content: 'Mensagem local do agente', createdAt: '2026-10-25T20:05:00.000Z' }
    ]
  }
];

const merged = mergeTicketsGranular(remoteTickets, localTickets);
assert.equal(merged.length, 1);
assert.equal(merged[0].messages.length, 2, 'Ambas as mensagens devem coexistir após reconciliação granular');
assert.equal(merged[0].status, 'in_production', 'Status não deve regredir');

console.log('✅ PASS: store.ts mergeTicketsGranular reconcilia dados sem perda e impede regressão');

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
