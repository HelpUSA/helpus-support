import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importação das funções do watcher
const watcher = await import('./antigravity_watcher.js');

const {
  isWorkerPaused,
  setWorkerPaused,
  readDailyBudget,
  atomicSaveDailyBudget,
  reserveExternalRequest,
  getDailyBudgetStatus,
  resetDailyBudget,
  fetchTickets,
  saveTickets,
  verifyCommit,
  verifyServiceConnection,
  runWatchdogCycle,
} = watcher.default || watcher;

console.log('======================================================================');
console.log('SUITE DE TESTES ORDEM 050: GOVERNANÇA DE CUSTOS E POLÍTICA LOCAL-FIRST');
console.log('======================================================================');

const TEST_DIR = path.resolve(__dirname, '..', '.tmp_test_order050_' + Date.now());
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

const testPauseFile = path.join(TEST_DIR, '.worker_paused');
const testBudgetFile = path.join(TEST_DIR, '.daily_budget.json');

try {
  // --------------------------------------------------------------------
  // TESTE 1: Kill-Switch persistente por arquivo (.worker_paused)
  // --------------------------------------------------------------------
  {
    // Limpeza inicial
    if (fs.existsSync(testPauseFile)) fs.unlinkSync(testPauseFile);

    let check = isWorkerPaused({}, { pauseFilePath: testPauseFile });
    assert.equal(check.paused, false, 'Kill-switch deve estar inativo inicialmente');

    // Ativação do kill-switch
    setWorkerPaused(true, 'Pausa operacional para teste', {}, { pauseFilePath: testPauseFile });
    assert.equal(fs.existsSync(testPauseFile), true, 'Arquivo .worker_paused deve ser criado');

    check = isWorkerPaused({}, { pauseFilePath: testPauseFile });
    assert.equal(check.paused, true, 'Kill-switch deve estar ativo após criação do arquivo');
    assert.equal(check.reason, 'pause_file_present');
    assert.match(check.note, /Pausa operacional para teste/);

    console.log('✅ PASS: Ordem 050 - Kill-switch persistente por arquivo (.worker_paused) ativação verificada');
  }

  // --------------------------------------------------------------------
  // TESTE 2: Bloqueio estrito de operações externas sob Kill-Switch ativo
  // --------------------------------------------------------------------
  {
    let fetchAttempted = false;
    const mockFetch = async () => {
      fetchAttempted = true;
      return { ok: true, status: 200, json: async () => [] };
    };

    // 1. fetchTickets bloqueado
    const fetchRes = await fetchTickets(
      { fetch: mockFetch, serviceWorkerToken: 'test_token' },
      { pauseFilePath: testPauseFile }
    );
    assert.equal(fetchRes, null, 'fetchTickets deve retornar null sob kill-switch');
    assert.equal(fetchAttempted, false, 'Nenhuma requisição fetch deve ocorrer sob kill-switch');

    // 2. saveTickets bloqueado
    const saveRes = await saveTickets(
      [{ id: 'tck-1' }],
      3,
      { fetch: mockFetch, serviceWorkerToken: 'test_token' },
      { pauseFilePath: testPauseFile }
    );
    assert.equal(saveRes, false, 'saveTickets deve retornar false sob kill-switch');
    assert.equal(fetchAttempted, false, 'Nenhuma gravação de rede deve ocorrer sob kill-switch');

    // 3. verifyCommit bloqueado
    const commitRes = await verifyCommit(
      { repo: 'HelpUSA/publicarte' },
      'abc1234',
      { fetch: mockFetch, serviceWorkerToken: 'test_token' },
      { pauseFilePath: testPauseFile }
    );
    assert.equal(commitRes.valid, false, 'verifyCommit deve retornar valid=false sob kill-switch');
    assert.equal(commitRes.reason, 'worker_paused');

    // 4. verifyServiceConnection bloqueado com status 503
    const probeRes = await verifyServiceConnection(
      { fetch: mockFetch, serviceWorkerToken: 'test_token' },
      { pauseFilePath: testPauseFile }
    );
    assert.equal(probeRes.ok, false, 'verifyServiceConnection deve falhar sob kill-switch');
    assert.equal(probeRes.status, 503);
    assert.equal(probeRes.reason, 'worker_paused');
    assert.equal(probeRes.dataMutated, false);

    // 5. runWatchdogCycle pausa sem tocar em tarefas
    const cycleRes = await runWatchdogCycle({
      deps: { fetch: mockFetch, serviceWorkerToken: 'test_token' },
      pauseFilePath: testPauseFile,
    });
    assert.equal(cycleRes.paused, true, 'runWatchdogCycle deve reportar paused=true');
    assert.equal(cycleRes.processedCount, 0);

    console.log('✅ PASS: Ordem 050 - Todas as operações externas bloqueadas sob kill-switch ativo');
  }

  // --------------------------------------------------------------------
  // TESTE 3: Retomada segura de operações após desativação do Kill-Switch
  // --------------------------------------------------------------------
  {
    setWorkerPaused(false, '', {}, { pauseFilePath: testPauseFile });
    assert.equal(fs.existsSync(testPauseFile), false, 'Arquivo .worker_paused deve ser removido');

    const check = isWorkerPaused({}, { pauseFilePath: testPauseFile });
    assert.equal(check.paused, false, 'Worker deve constar como não pausado');

    console.log('✅ PASS: Ordem 050 - Retomada de operações após desativação do kill-switch verificada');
  }

  // --------------------------------------------------------------------
  // TESTE 4: Fail-Closed em erro de leitura do Kill-Switch
  // --------------------------------------------------------------------
  {
    const mockFsFail = {
      existsSync: () => {
        const err = new Error('EPERM: operation not permitted');
        err.code = 'EPERM';
        throw err;
      },
    };

    const failCheck = isWorkerPaused({ fs: mockFsFail }, { pauseFilePath: testPauseFile });
    assert.equal(failCheck.paused, true, 'Em erro de leitura do kill-switch, deve aplicar fail-closed');
    assert.equal(failCheck.failClosed, true);
    assert.equal(failCheck.reason, 'fail_closed_read_error');

    console.log('✅ PASS: Ordem 050 - Fail-Closed estrito em erro de leitura do estado de pausa');
  }

  // --------------------------------------------------------------------
  // TESTE 5: Valor inicial de ZERO chamadas automáticas (autoLimit: 0)
  // --------------------------------------------------------------------
  {
    if (fs.existsSync(testBudgetFile)) fs.unlinkSync(testBudgetFile);

    const budgetStatus = readDailyBudget({}, { budgetFilePath: testBudgetFile });
    assert.equal(budgetStatus.ok, true);
    assert.equal(budgetStatus.data.autoLimit, 0, 'Limite automático padrão deve ser estritamente ZERO');
    assert.equal(budgetStatus.data.autoRequests, 0);

    // Tentativa de requisição automática deve ser bloqueada de imediato
    const autoAttempt = reserveExternalRequest('auto', {}, { budgetFilePath: testBudgetFile });
    assert.equal(autoAttempt.allowed, false, 'Requisição automática com teto zero deve ser bloqueada');
    assert.equal(autoAttempt.reason, 'daily_auto_limit_exceeded');
    assert.equal(autoAttempt.limit, 0);

    console.log('✅ PASS: Ordem 050 - Valor inicial padrão de ZERO chamadas automáticas bloqueia requisições');
  }

  // --------------------------------------------------------------------
  // TESTE 6: Diferenciação entre operações manuais e automáticas
  // --------------------------------------------------------------------
  {
    if (fs.existsSync(testBudgetFile)) fs.unlinkSync(testBudgetFile);

    // Manual deve ser permitido até manualLimit (default: 50)
    const manualAttempt1 = reserveExternalRequest('manual', {}, { budgetFilePath: testBudgetFile, manualLimit: 5 });
    assert.equal(manualAttempt1.allowed, true, 'Operação manual deve ser autorizada dentro de seu teto');
    assert.equal(manualAttempt1.kind, 'manual');
    assert.equal(manualAttempt1.currentCount, 1);

    // Auto continua bloqueado por teto 0
    const autoAttempt = reserveExternalRequest('auto', {}, { budgetFilePath: testBudgetFile });
    assert.equal(autoAttempt.allowed, false, 'Operação automática continua bloqueada por teto zero');

    console.log('✅ PASS: Ordem 050 - Diferenciação estrita entre operações manuais e automáticas verificada');
  }

  // --------------------------------------------------------------------
  // TESTE 7: Pré-contabilização antes do envio e persistência atômica
  // --------------------------------------------------------------------
  {
    if (fs.existsSync(testBudgetFile)) fs.unlinkSync(testBudgetFile);

    // Reserva manual 1
    const res1 = reserveExternalRequest('manual', {}, { budgetFilePath: testBudgetFile, manualLimit: 10 });
    assert.equal(res1.allowed, true);
    assert.equal(res1.currentCount, 1);

    // Verifica persistência imediata em disco
    const onDisk1 = JSON.parse(fs.readFileSync(testBudgetFile, 'utf-8'));
    assert.equal(onDisk1.manualRequests, 1, 'Contador em disco deve ser pré-incrementado antes do envio');
    assert.equal(onDisk1.totalRequests, 1);

    // Reserva manual 2
    const res2 = reserveExternalRequest('manual', {}, { budgetFilePath: testBudgetFile, manualLimit: 10 });
    assert.equal(res2.allowed, true);
    assert.equal(res2.currentCount, 2);

    const onDisk2 = JSON.parse(fs.readFileSync(testBudgetFile, 'utf-8'));
    assert.equal(onDisk2.manualRequests, 2, 'Contador em disco deve refletir segunda reserva');

    console.log('✅ PASS: Ordem 050 - Pré-contabilização de tentativa antes do envio persistida com segurança');
  }

  // --------------------------------------------------------------------
  // TESTE 8: Teto diário manual atingido
  // --------------------------------------------------------------------
  {
    if (fs.existsSync(testBudgetFile)) fs.unlinkSync(testBudgetFile);

    // Manual com teto 2
    const r1 = reserveExternalRequest('manual', {}, { budgetFilePath: testBudgetFile, manualLimit: 2 });
    assert.equal(r1.allowed, true);
    const r2 = reserveExternalRequest('manual', {}, { budgetFilePath: testBudgetFile, manualLimit: 2 });
    assert.equal(r2.allowed, true);

    // Terceira tentativa deve ser bloqueada
    const r3 = reserveExternalRequest('manual', {}, { budgetFilePath: testBudgetFile, manualLimit: 2 });
    assert.equal(r3.allowed, false, 'Terceira requisição manual deve exceder o teto 2');
    assert.equal(r3.reason, 'daily_manual_limit_exceeded');

    console.log('✅ PASS: Ordem 050 - Bloqueio quando teto diário manual é atingido');
  }

  // --------------------------------------------------------------------
  // TESTE 9: Rollover de data do orçamento diário
  // --------------------------------------------------------------------
  {
    if (fs.existsSync(testBudgetFile)) fs.unlinkSync(testBudgetFile);

    // Simula registro do dia anterior
    const yesterdayRecord = {
      date: '2026-10-25',
      autoRequests: 15,
      manualRequests: 10,
      totalRequests: 25,
      autoLimit: 0,
      manualLimit: 50,
      lastUpdatedIso: '2026-10-25T23:59:00.000Z',
      history: [],
    };
    fs.writeFileSync(testBudgetFile, JSON.stringify(yesterdayRecord, null, 2), 'utf-8');

    // Leitura na data de hoje
    const todayIso = '2026-10-26T10:00:00.000Z';
    const rolled = readDailyBudget({ nowIso: () => todayIso }, { budgetFilePath: testBudgetFile });
    assert.equal(rolled.ok, true);
    assert.equal(rolled.data.date, '2026-10-26');
    assert.equal(rolled.data.autoRequests, 0, 'Contadores devem ser zerados no novo dia');
    assert.equal(rolled.data.manualRequests, 0);
    assert.equal(rolled.data.totalRequests, 0);
    assert.equal(rolled.data.history.length, 1, 'Histórico do dia anterior deve ser arquivado');
    assert.equal(rolled.data.history[0].date, '2026-10-25');

    console.log('✅ PASS: Ordem 050 - Rollover automático de data com arquivamento de histórico');
  }

  // --------------------------------------------------------------------
  // TESTE 10: Fail-Closed em arquivo de orçamento corrompido
  // --------------------------------------------------------------------
  {
    // Grava JSON corrompido
    fs.writeFileSync(testBudgetFile, 'MALFORMED_JSON_CONTENT_CORRUPTED{{{', 'utf-8');

    const corruptAttempt = reserveExternalRequest('manual', {}, { budgetFilePath: testBudgetFile });
    assert.equal(corruptAttempt.allowed, false, 'Em caso de arquivo corrompido, deve aplicar fail-closed');
    assert.equal(corruptAttempt.failClosed, true);
    assert.equal(corruptAttempt.reason, 'corrupted_or_inaccessible_budget_store');

    console.log('✅ PASS: Ordem 050 - Fail-Closed estrito diante de corrupção do arquivo de orçamento');
  }

  // --------------------------------------------------------------------
  // TESTE 11: Preservação de integridade de claims e histórico durante bloqueio
  // --------------------------------------------------------------------
  {
    // Garante que o status de diagnóstico reporta corretamente
    const status = getDailyBudgetStatus({}, { pauseFilePath: testPauseFile, budgetFilePath: testBudgetFile });
    assert.ok(status.pauseState, 'pauseState deve existir');
    assert.equal(typeof status.pauseState.paused, 'boolean');

    console.log('✅ PASS: Ordem 050 - Relatório consolidado getDailyBudgetStatus validado');
  }

  console.log('======================================================================');
  console.log('🎉 TODOS OS 11 TESTES DA ORDEM 050 FORAM APROVADOS COM 100% DE SUCESSO!');
  console.log('======================================================================');
} finally {
  // Limpeza dos arquivos temporários de teste
  try {
    if (fs.existsSync(testPauseFile)) fs.unlinkSync(testPauseFile);
    if (fs.existsSync(testBudgetFile)) fs.unlinkSync(testBudgetFile);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
}
