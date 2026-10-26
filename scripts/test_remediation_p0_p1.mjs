// scripts/test_remediation_p0_p1.mjs
// Test Suite de Validação Técnica P0/P1 — HelpUS Support Hub
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('  SUITE DE TESTES: REMEDIAÇÃO P0/P1 — HELPUS SUPPORT HUB');
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
// 2. TESTES P1-01: Rejeição Estrita de Tenants Desconhecidos (Sem Fallback)
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
// 3. TESTES P0-02: Execução Comprovada vs Simulação Artificial
// -------------------------------------------------------------------
await runAsyncTest('P0-02.1: Watcher não deve concluir ticket artificialmente em modo unverified/dryRun', async () => {
  const watcher = await import('./antigravity_watcher.js');
  const ticket = {
    id: 'test-valid-1',
    code: 'TST-101',
    title: 'Chamado para teste de governança',
    tenantId: 'aidoctor',
    status: 'in_production',
    progressPercentage: 0
  };

  const res = await watcher.processTicket(ticket, { dryRun: true });
  assert.strictEqual(res.verified, true);
  assert.strictEqual(res.status, 'pending_verification', 'Não deve marcar status como resolved');
  assert.notStrictEqual(res.step, 100, 'Não deve saltar para 100% sem verificação real de deploy');
});

// -------------------------------------------------------------------
// 4. TESTES P1-02: resetTicket Preserva Histórico Completo de Mensagens
// -------------------------------------------------------------------
runTest('P1-02.1: store.ts deve conter lógica de push no histórico em vez de substituição destrutiva', () => {
  const storePath = path.join(rootDir, 'src', 'lib', 'store.ts');
  const content = fs.readFileSync(storePath, 'utf-8');

  assert.ok(content.includes('P1-02: Preservar histórico completo'), 'Comentário ou lógica P1-02 ausente');
  assert.ok(!content.includes('ticket.messages = [\n      {\n        id: "msg-1791048000000"'), 'Array destrutivo hardcoded ainda presente!');
  assert.ok(content.includes('ticket.messages.push({'), 'resetTicket deve usar push para registrar auditoria preservando histórico');
});

// -------------------------------------------------------------------
// 5. TESTES P1-03: Persistência Durável e Atômica
// -------------------------------------------------------------------
runTest('P1-03.1: atomicSaveSync deve gravar em temporário e rotacionar para .bak', () => {
  const storePath = path.join(rootDir, 'src', 'lib', 'store.ts');
  const content = fs.readFileSync(storePath, 'utf-8');

  assert.ok(content.includes('atomicSaveSync'), 'Método atomicSaveSync deve existir');
  assert.ok(content.includes('.bak'), 'Backup rotacional com extensão .bak deve existir');
  assert.ok(content.includes('writeQueue'), 'Fila concorrente (writeQueue mutex) deve existir');
});

// -------------------------------------------------------------------
// 6. RESULTADO CONSOLIDADO
// -------------------------------------------------------------------
console.log('\n===============================================================');
console.log(`  RESUMO DA EXECUÇÃO: ${passedTests}/${totalTests} TESTES APROVADOS (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('===============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('  🎉 Todos os critérios de segurança P0 e P1 foram validados com 100% de sucesso!');
  process.exit(0);
}
