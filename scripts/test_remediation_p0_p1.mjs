// scripts/test_remediation_p0_p1.mjs
// Test Suite de Validação Técnica P0/P1 & Auditoria Comportamental — HelpUS Support Hub
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('  SUITE DE TESTES: REMEDIAÇÃO P0/P1 & AUDITORIA COMPORTAMENTAL');
console.log('===============================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Erro: ${err.message}\n`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Erro: ${err.message}\n`);
  }
}

// -------------------------------------------------------------------
// 1. TESTES P0-01: Remoção de Credenciais Hardcoded do Watcher
// -------------------------------------------------------------------
runTest('P0-01.1: antigravity_watcher.js NÃO deve conter DEFAULT_GH_TOKEN ou token hardcoded', () => {
  const watcherPath = path.join(rootDir, 'scripts', 'antigravity_watcher.js');
  const content = fs.readFileSync(watcherPath, 'utf-8');

  assert.ok(!content.includes('DEFAULT_GH_TOKEN'), 'DEFAULT_GH_TOKEN ainda encontrado no código!');
  assert.ok(!content.includes('gho_'), 'Prefixo de token GitHub (gho_) encontrado hardcoded no watcher!');
  assert.ok(content.includes('process.env.GITHUB_TOKEN'), 'GITHUB_TOKEN deve ser lido de process.env');
});

// -------------------------------------------------------------------
// 2. TESTES P0-01 (Auditoria): Deploy Hook 2xx NÃO marca resolved sem validação READY
// -------------------------------------------------------------------
await runAsyncTest('P0-01.2: Disparo de deploy hook sem validação READY deve reter chamado em in_production (75%), nunca resolved (100%)', async () => {
  const watcher = await import('./antigravity_watcher.js');
  const ticket = {
    id: 'test-hook-1',
    code: 'TST-HOOK',
    title: 'Chamado para teste de deploy assíncrono',
    tenantId: 'aidoctor',
    status: 'in_production',
    progressPercentage: 0,
    solutionCommitSha: 'a1b2c3d4e5f6'
  };

  // Simula execução sem confirmação explícita de READY
  const res = await watcher.processTicket(ticket, { dryRun: true });
  assert.strictEqual(res.verified, true);
  assert.strictEqual(res.status, 'pending_verification', 'Status não pode ser resolved!');
  assert.notStrictEqual(res.step, 100, 'Não deve marcar 100% no disparo inicial do hook');
});

// -------------------------------------------------------------------
// 3. TESTES P0-02 (Auditoria): Validação Estrita dos Retornos de Persistência
// -------------------------------------------------------------------
runTest('P0-02.1: Watcher deve testar explicitamente o retorno de updateCloud e abortar se persistência falhar', () => {
  const watcherPath = path.join(rootDir, 'scripts', 'antigravity_watcher.js');
  const content = fs.readFileSync(watcherPath, 'utf-8');

  assert.ok(content.includes('const ok25 = await updateCloud'), 'Retorno de updateCloud(25) não é verificado!');
  assert.ok(content.includes('const ok50 = await updateCloud'), 'Retorno de updateCloud(50) não é verificado!');
  assert.ok(content.includes('const ok75 = await updateCloud'), 'Retorno de updateCloud(75) não é verificado!');
  assert.ok(content.includes('const ok100 = await updateCloud'), 'Retorno de updateCloud(100) não é verificado!');
  assert.ok(content.includes('if (!ok100)'), 'Falha ao salvar 100% deve ser tratada!');
});

// -------------------------------------------------------------------
// 4. TESTES P0-03 (Auditoria): Etapa 50% Exige Commit de Código Verificável
// -------------------------------------------------------------------
await runAsyncTest('P0-03.1: Chamado sem commit comprovado deve reter em 25% e não avançar nominalmente para 50%', async () => {
  const watcher = await import('./antigravity_watcher.js');
  const ticketWithoutCommit = {
    id: 'test-nocommit-1',
    code: 'TST-NOCOMMIT',
    title: 'Chamado sem código alterado',
    tenantId: 'brayyan',
    status: 'in_production',
    progressPercentage: 0
    // solutionCommitSha omitido propositalmente
  };

  const res = await watcher.processTicket(ticketWithoutCommit, { allowAutonomousDeploy: true });
  assert.strictEqual(res.step, 25, 'Não deve avançar para 50% sem commit comprovado!');
  assert.notStrictEqual(res.step, 50, 'Não deve saltar para 50% sem commit de alteração!');
});

// -------------------------------------------------------------------
// 5. TESTES P1-01: Rejeição Estrita de Tenants Desconhecidos (Sem Fallback)
// -------------------------------------------------------------------
await runAsyncTest('P1-01.1: processTicket deve lançar erro explícito em tenant desconhecido sem fallback para brayyan', async () => {
  const watcher = await import('./antigravity_watcher.js');
  const invalidTicket = {
    id: 'test-invalid-1',
    code: 'INV-001',
    title: 'Chamado em tenant desconhecido',
    tenantId: 'sistema-hacker-fantasma',
    status: 'in_production',
    progressPercentage: 0
  };

  let threw = false;
  try {
    await watcher.processTicket(invalidTicket);
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('Tenant desconhecido'), `Mensagem de erro inesperada: ${err.message}`);
    assert.ok(err.message.includes('sistema-hacker-fantasma'), 'Tenant inválido deve constar na mensagem');
  }
  assert.ok(threw, 'Deveria ter lançado erro para tenant desconhecido, mas prosseguiu com fallback!');
});

await runAsyncTest('P1-01.2: Todos os tenants oficiais da plataforma devem ser reconhecidos', async () => {
  const watcher = await import('./antigravity_watcher.js');
  const requiredTenants = ['brayyan', 'publicarte', 'usmle', 'studionaldohair', 'aidoctor'];

  for (const tid of requiredTenants) {
    assert.ok(watcher.TENANTS[tid], `Tenant obrigatório ausente: ${tid}`);
    assert.ok(watcher.TENANTS[tid].domain, `Domínio ausente para tenant: ${tid}`);
  }
});

// -------------------------------------------------------------------
// 6. TESTES P1-02: fetchTickets Retorna null em Falha de Rede/API
// -------------------------------------------------------------------
runTest('P1-02.1: fetchTickets() e fetchGitHubTickets() devem retornar null em erro para não mascarar falhas como base vazia', () => {
  const watcherPath = path.join(rootDir, 'scripts', 'antigravity_watcher.js');
  const content = fs.readFileSync(watcherPath, 'utf-8');

  assert.ok(content.includes('return null;'), 'fetchTickets deve retornar null em caso de erro');

  const storePath = path.join(rootDir, 'src', 'lib', 'store.ts');
  const storeContent = fs.readFileSync(storePath, 'utf-8');
  assert.ok(storeContent.includes('fetchGitHubTickets(): Promise<Ticket[] | null>'), 'store.ts deve tipar fetchGitHubTickets como Promise<Ticket[] | null>');
  assert.ok(storeContent.includes('return fetchFailed ? null : [];'), 'store.ts deve retornar null em fetchFailed');
});

// -------------------------------------------------------------------
// 7. TESTES P1-02: resetTicket Preserva Histórico Completo de Mensagens
// -------------------------------------------------------------------
runTest('P1-02.2: store.ts deve conter lógica de push no histórico em vez de substituição destrutiva', () => {
  const storePath = path.join(rootDir, 'src', 'lib', 'store.ts');
  const content = fs.readFileSync(storePath, 'utf-8');

  assert.ok(content.includes('P1-02: Preservar histórico completo'), 'Comentário ou lógica P1-02 ausente');
  assert.ok(!content.includes('ticket.messages = [\n      {\n        id: "msg-1791048000000"'), 'Array destrutivo hardcoded ainda presente!');
  assert.ok(content.includes('ticket.messages.push({'), 'resetTicket deve usar push para registrar auditoria preservando histórico');
});

// -------------------------------------------------------------------
// 8. TESTES P1-03: Persistência Durável com CAS e Concorrência
// -------------------------------------------------------------------
runTest('P1-03.1: store.ts deve implementar Compare-And-Swap (CAS) com tratamento de conflito 409 e retry', () => {
  const storePath = path.join(rootDir, 'src', 'lib', 'store.ts');
  const content = fs.readFileSync(storePath, 'utf-8');

  assert.ok(content.includes('CAS CONFLICT'), 'Tratamento de conflito 409 com reconciliação deve existir');
  assert.ok(content.includes('maxRetries = 3'), 'Mecanismo de retry CAS deve existir');
  assert.ok(content.includes('atomicSaveSync'), 'Método atomicSaveSync deve existir');
  assert.ok(content.includes('.bak'), 'Backup rotacional com extensão .bak deve existir');
  assert.ok(content.includes('writeQueue'), 'Fila concorrente (writeQueue mutex) deve existir');
});

// -------------------------------------------------------------------
// 9. RESULTADO CONSOLIDADO
// -------------------------------------------------------------------
console.log('\n===============================================================');
console.log(`  RESUMO DA EXECUÇÃO: ${passedTests}/${totalTests} TESTES APROVADOS (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('===============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('  🎉 Todos os 9 testes comportamentais e de integridade P0/P1 foram 100% APROVADOS!');
  process.exit(0);
}
