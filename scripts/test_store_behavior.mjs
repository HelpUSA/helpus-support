// scripts/test_store_behavior.mjs
// Teste comportamental de resiliência e concorrência do store.ts

import assert from 'node:assert/strict';

// Teste direto da lógica de reconciliação granular exportada
import { mergeTicketsGranular, TicketStore } from '../src/lib/store.ts';

console.log('='.repeat(70));
console.log('TESTES DE INTEGRIDADE DO STORE (store.ts)');
console.log('='.repeat(70));

// Teste 1: Reconciliação sem perda de mensagens concorrentes
const remoteTickets = [
  {
    id: 'T-CAS-1',
    code: 'T-CAS-1',
    tenantId: 'aidoctor',
    status: 'pending_approval',
    updatedAt: '2026-10-25T20:00:00.000Z',
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
assert.equal(merged[0].status, 'in_production', 'Status deve refletir a versão mais recente');

console.log('✅ PASS: store.ts mergeTicketsGranular reconcilia dados sem perda de mensagens');

// Teste 2: saveAsync rejeita falso sucesso se persistência compartilhada em nuvem falhar
process.env.GITHUB_TOKEN = 'ghp_mock_invalid_token_forces_failure';
process.env.HELPUS_DB_REPO = 'HelpUSA/non_existent_repo_forces_failure_404';

const store = new TicketStore();
const saveResult = await store.saveAsync();

assert.equal(saveResult.success, false, 'saveAsync deve falhar se o GitHub Cloud falhar, mesmo que o arquivo local /tmp tenha sido gravado');
console.log('✅ PASS: store.ts saveAsync rejeita falso sucesso quando persistência compartilhada falha');

console.log('='.repeat(70));
console.log('TODOS OS TESTES DE INTEGRIDADE DO STORE FORAM APROVADOS!');
console.log('='.repeat(70));
