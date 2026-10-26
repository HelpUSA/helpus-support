const fs = require('fs');
const path = require('path');

const crypto = require('crypto');

// P0-A (Ciclo 027): Eliminação total de segredo estático fallback no repositório.
// Fail-closed em produção/Vercel. Chave efêmera aleatória em dev/test.
function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.AUTH_SECRET || process.env.SUPERADMIN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
      throw new Error('[SECURITY FATAL] SESSION_SECRET não configurado em ambiente de produção.');
    }
    return global.__EPHEMERAL_SESSION_SECRET || (global.__EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex'));
  }
  return secret;
}

function getEventHmacSecret() {
  const secret = process.env.EVENT_HMAC_SECRET || process.env.TICKET_EVENT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
      throw new Error('[SECURITY FATAL] EVENT_HMAC_SECRET não configurado em ambiente de produção.');
    }
    return global.__EPHEMERAL_WATCHER_EVENT_SECRET || (global.__EPHEMERAL_WATCHER_EVENT_SECRET = crypto.randomBytes(32).toString('hex'));
  }
  return secret;
}

function safeTimingEqual(a, b) {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a, 'hex');
    const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// P0-C (Ciclo 027): Cálculo canônico idêntico ao servidor para cobertura integral de governança
function computeEventPayload(event) {
  const parts = [
    event.id,
    event.ticketId,
    event.tenantId || '',
    event.type,
    event.status,
    event.progressPercentage ?? 0,
    event.actorEmail || '',
    event.actorRole || '',
    event.timestamp,
    event.seq ?? 0,
    event.idempotencyKey || '',
    event.note || '',
    event.authorized ? 'auth:true' : 'auth:false',
  ];
  return parts.join('|');
}

function signTicketEvent(event) {
  const secret = getEventHmacSecret();
  const payload = computeEventPayload(event);
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// P0-B (Ciclo 027): Verificação com ZERO bypass por prefixo de ID e comparação constant-time
function verifyTicketEventIntegrity(event, maxFutureSkewMs = 60000, referenceNowMs = Date.now()) {
  if (!event || !event.id || !event.type || !event.timestamp) {
    return { valid: false, reason: 'missing_fields' };
  }
  const eventTime = new Date(event.timestamp).getTime();
  if (isNaN(eventTime)) {
    return { valid: false, reason: 'invalid_timestamp_format' };
  }
  if (eventTime > referenceNowMs + maxFutureSkewMs) {
    return { valid: false, reason: 'future_timestamp_rejected' };
  }
  if (event.type === 'master_approved' || event.type === 'ticket_reset_by_master' || event.type === 'ticket_rejected') {
    if (event.actorRole !== 'master_superadmin') {
      return { valid: false, reason: 'invalid_role_for_master_event' };
    }
  }

  // P0-B: Zero bypass por prefixo de ID!
  if (!event.signature || typeof event.signature !== 'string') {
    return { valid: false, reason: 'missing_server_signature' };
  }
  const expectedSig = signTicketEvent(event);
  if (!safeTimingEqual(event.signature, expectedSig)) {
    return { valid: false, reason: 'tampered_signature' };
  }
  return { valid: true };
}

// P0-01 & Ordem 041: Resolução segura de credencial de serviço de menor privilégio.
// Ordem de precedência:
// 1. deps.serviceWorkerToken / deps.githubToken (injeção explícita de teste/sandbox)
// 2. process.env.SERVICE_WORKER_GITHUB_TOKEN (token de serviço com escopo Contents:read/write restrito)
// 3. process.env.GITHUB_TOKEN / process.env.GH_TOKEN
// Fail-closed: Se ausente, retorna null e bloqueia chamadas não autenticadas para proteger cotas do host.
// P0-01 & Ordem 041 & Ordem 048: Resolução segura de credencial de serviço de menor privilégio.
// 1. Injeção explícita em testes isolados (deps.serviceWorkerToken / deps.githubToken).
// 2. process.env.SERVICE_WORKER_GITHUB_TOKEN (token de serviço com escopo Contents restrito).
// 3. No modo contínuo / worker de produção: EXCLUSIVAMENTE SERVICE_WORKER_GITHUB_TOKEN (zero fallback).
// Fail-closed: Se ausente, retorna null e bloqueia chamadas não autenticadas para proteger cotas do host.
function resolveServiceWorkerToken(deps = {}, options = {}) {
  if (deps.serviceWorkerToken && typeof deps.serviceWorkerToken === "string") {
    return deps.serviceWorkerToken.trim();
  }
  if (deps.githubToken && typeof deps.githubToken === "string") {
    return deps.githubToken.trim();
  }
  const env = deps.env || process.env;
  const swToken = (env.SERVICE_WORKER_GITHUB_TOKEN || "").trim();
  if (swToken) {
    return swToken;
  }

  // Ordem 048: No modo contínuo, proibição terminante de fallback para GITHUB_TOKEN, GH_TOKEN ou CLI
  const isContinuous = Boolean(
    options.isContinuous ||
    deps.isContinuous ||
    (typeof process !== 'undefined' && (
      process.env.WORKER_MODE === 'continuous' ||
      (Array.isArray(process.argv) && (process.argv.includes('--mode=continuous') || process.argv.includes('-c')))
    ))
  );

  if (isContinuous) {
    const hasLegacy = Boolean((env.GITHUB_TOKEN || env.GH_TOKEN || '').trim());
    if (hasLegacy) {
      console.warn('[WORKER AUTH POLICY] Modo contínuo exige exclusivamente SERVICE_WORKER_GITHUB_TOKEN. Fallback para GITHUB_TOKEN/GH_TOKEN/CLI rejeitado por política de menor privilégio.');
    }
    return null;
  }

  // Em chamadas ad-hoc não contínuas, fallback legado permitido
  const legacyToken = (env.GITHUB_TOKEN || env.GH_TOKEN || "").trim();
  return legacyToken || null;
}

function inspectTokenMetadata(token) {
  if (!token || typeof token !== "string") {
    return { configured: false, kind: "none", length: 0 };
  }
  const clean = token.trim();
  let kind = "custom_token";
  if (clean.startsWith("ghp_")) kind = "personal_access_token_classic";
  else if (clean.startsWith("github_pat_")) kind = "fine_grained_pat";
  else if (clean.startsWith("gho_")) kind = "oauth_token";
  else if (clean.startsWith("ghs_")) kind = "installation_token";

  return {
    configured: true,
    kind,
    length: clean.length,
    prefix: clean.slice(0, 4) + "...",
  };
}

// Ordem 041: Motor de controle de Rate Limit, escopos e backoff adaptativo
const rateLimitState = {
  limit: null,
  remaining: null,
  resetEpochSec: null,
  backoffUntilMs: 0,
  consecutiveFailures: 0,
  lastStatus: null,
  detectedScopes: [],
};

function getRateLimitState() {
  return { ...rateLimitState };
}

function resetRateLimitState() {
  rateLimitState.limit = null;
  rateLimitState.remaining = null;
  rateLimitState.resetEpochSec = null;
  rateLimitState.backoffUntilMs = 0;
  rateLimitState.consecutiveFailures = 0;
  rateLimitState.lastStatus = null;
  rateLimitState.detectedScopes = [];
}

function isRateLimitBackoffActive(now = Date.now()) {
  return rateLimitState.backoffUntilMs > now;
}

function updateRateLimitFromResponse(res, now = Date.now()) {
  if (!res) return;
  const getHeader = (name) => {
    if (res.headers && typeof res.headers.get === "function") {
      return res.headers.get(name);
    }
    if (res.headers && typeof res.headers === "object") {
      return res.headers[name.toLowerCase()] || res.headers[name] || null;
    }
    return null;
  };

  const limitHeader = getHeader("x-ratelimit-limit");
  const remainingHeader = getHeader("x-ratelimit-remaining");
  const resetHeader = getHeader("x-ratelimit-reset");
  const retryAfterHeader = getHeader("retry-after");
  const scopesHeader = getHeader("x-oauth-scopes");

  if (limitHeader != null) {
    const l = parseInt(limitHeader, 10);
    if (!isNaN(l)) rateLimitState.limit = l;
  }
  if (remainingHeader != null) {
    const r = parseInt(remainingHeader, 10);
    if (!isNaN(r)) rateLimitState.remaining = r;
  }
  if (resetHeader != null) {
    const r = parseInt(resetHeader, 10);
    if (!isNaN(r)) rateLimitState.resetEpochSec = r;
  }
  if (scopesHeader != null && typeof scopesHeader === "string") {
    rateLimitState.detectedScopes = scopesHeader.split(",").map((s) => s.trim()).filter(Boolean);
  }

  rateLimitState.lastStatus = res.status;

  const isRateLimited = res.status === 429 || (res.status === 403 && rateLimitState.remaining === 0);

  if (isRateLimited || res.status === 403) {
    rateLimitState.consecutiveFailures++;
    let waitMs = 15000;

    if (retryAfterHeader) {
      const parsedRetry = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsedRetry) && parsedRetry > 0) {
        waitMs = parsedRetry * 1000;
      }
    } else if (rateLimitState.resetEpochSec) {
      const msUntilReset = (rateLimitState.resetEpochSec * 1000) - now;
      if (msUntilReset > 0) {
        waitMs = Math.min(msUntilReset + 2000, 3600000);
      } else {
        waitMs = 15000;
      }
    } else {
      waitMs = Math.min(10000 * Math.pow(2, Math.max(0, rateLimitState.consecutiveFailures - 1)), 120000);
    }

    rateLimitState.backoffUntilMs = now + waitMs;
    console.warn("[WATCHDOG RATE_LIMIT] GitHub API respondeu HTTP " + res.status + " (remaining: " + (rateLimitState.remaining ?? "N/A") + "). Backoff ativado por " + Math.round(waitMs / 1000) + "s.");
  } else if (res.ok) {
    rateLimitState.consecutiveFailures = 0;
    rateLimitState.backoffUntilMs = 0;
  }
}

const GITHUB_TOKEN = process.env.SERVICE_WORKER_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
const DB_REPO = process.env.HELPUS_DB_REPO || "HelpUSA/publicarte";
const DB_PATH = process.env.HELPUS_DB_PATH || "data/helpus_tickets.json";

// ============================================================================
// ORDEM 050: GOVERNANÇA DE CONSUMO LOCAL-FIRST, KILL-SWITCH E CONTADOR DIÁRIO
// ============================================================================

const DEFAULT_PAUSE_FILE = path.resolve(__dirname, '..', '.worker_paused');
const DEFAULT_BUDGET_FILE = path.resolve(__dirname, '..', '.helpus_daily_external_budget.json');

/**
 * Ordem 050: Resolução do caminho do arquivo de pausa (kill-switch)
 */
function resolvePauseFilePath(deps = {}, options = {}) {
  return (
    options.pauseFilePath ||
    deps.pauseFilePath ||
    (typeof process !== 'undefined' && process.env.WORKER_PAUSE_FILE) ||
    DEFAULT_PAUSE_FILE
  );
}

/**
 * Ordem 050: Verificação de Kill-Switch persistente (.worker_paused).
 * Fail-Closed: se houver erro ao acessar o arquivo (ex: EPERM, EACCES), assume pausado por segurança.
 */
function isWorkerPaused(deps = {}, options = {}) {
  if (options.isPaused !== undefined) {
    return { paused: Boolean(options.isPaused), reason: 'explicit_option' };
  }
  if (deps.isPaused !== undefined) {
    return { paused: Boolean(deps.isPaused), reason: 'explicit_dep' };
  }

  const env = deps.env || process.env;
  const envPaused = (env.HELPUS_WORKER_PAUSED || '').trim().toLowerCase();
  if (envPaused === '1' || envPaused === 'true' || envPaused === 'yes') {
    return { paused: true, reason: 'env_var', envVar: 'HELPUS_WORKER_PAUSED' };
  }

  const pauseFile = resolvePauseFilePath(deps, options);
  const fsModule = deps.fs || fs;

  try {
    if (fsModule.existsSync(pauseFile)) {
      let note = '';
      try {
        note = fsModule.readFileSync(pauseFile, 'utf-8').trim();
      } catch {}
      return {
        paused: true,
        reason: 'pause_file_present',
        path: pauseFile,
        note: note || 'Kill-switch ativo via arquivo .worker_paused',
      };
    }
    return { paused: false, reason: 'unpaused', path: pauseFile };
  } catch (err) {
    console.warn(`[WORKER PAUSE FAIL_CLOSED] Erro ao ler estado do kill-switch (${err.message}). Aplicando fail-closed.`);
    return {
      paused: true,
      reason: 'fail_closed_read_error',
      error: err.message,
      failClosed: true,
      path: pauseFile,
    };
  }
}

/**
 * Ordem 050: Ativação ou desativação segura do kill-switch para o operador
 */
function setWorkerPaused(paused = true, note = '', deps = {}, options = {}) {
  const pauseFile = resolvePauseFilePath(deps, options);
  const fsModule = deps.fs || fs;

  try {
    if (paused) {
      const content = note || `Kill-switch ativado em ${new Date().toISOString()} pelo operador HelpUS.`;
      fsModule.writeFileSync(pauseFile, content, 'utf-8');
      return { ok: true, paused: true, path: pauseFile };
    } else {
      if (fsModule.existsSync(pauseFile)) {
        fsModule.unlinkSync(pauseFile);
      }
      return { ok: true, paused: false, path: pauseFile };
    }
  } catch (err) {
    console.error(`[WORKER PAUSE ERROR] Falha ao atualizar kill-switch (${err.message}).`);
    return { ok: false, error: err.message, path: pauseFile };
  }
}

/**
 * Ordem 050: Resolução do caminho do arquivo de orçamento diário
 */
function resolveBudgetFilePath(deps = {}, options = {}) {
  return (
    options.budgetFilePath ||
    deps.budgetFilePath ||
    (typeof process !== 'undefined' && process.env.DAILY_BUDGET_FILE) ||
    DEFAULT_BUDGET_FILE
  );
}

/**
 * Ordem 050: Leitura do contador diário local persistente de requisições externas.
 * Teto configurável e valor inicial padrão de ZERO chamadas automáticas.
 * Fail-Closed: se o arquivo não puder ser lido ou for corrompido, bloqueia requisições externas.
 */
function readDailyBudget(deps = {}, options = {}) {
  if (deps.inMemoryBudget) {
    return { ok: true, data: { ...deps.inMemoryBudget } };
  }

  const nowIso = deps.nowIso ? deps.nowIso() : new Date().toISOString();
  const todayDate = nowIso.slice(0, 10);
  const env = deps.env || process.env;

  const defaultAutoLimit = Number(options.autoLimit ?? deps.autoLimit ?? env.DAILY_EXTERNAL_REQ_LIMIT_AUTO ?? 0);
  const defaultManualLimit = Number(options.manualLimit ?? deps.manualLimit ?? env.DAILY_EXTERNAL_REQ_LIMIT_MANUAL ?? 50);

  const budgetFile = resolveBudgetFilePath(deps, options);
  const fsModule = deps.fs || fs;

  try {
    if (!fsModule.existsSync(budgetFile)) {
      const initialRecord = {
        date: todayDate,
        autoRequests: 0,
        manualRequests: 0,
        totalRequests: 0,
        autoLimit: defaultAutoLimit,
        manualLimit: defaultManualLimit,
        lastUpdatedIso: nowIso,
        history: [],
      };
      return { ok: true, data: initialRecord, isNew: true };
    }

    const raw = fsModule.readFileSync(budgetFile, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Conteúdo do arquivo de orçamento não é um objeto JSON válido.');
    }

    if (parsed.date !== todayDate) {
      const rolloverRecord = {
        date: todayDate,
        autoRequests: 0,
        manualRequests: 0,
        totalRequests: 0,
        autoLimit: defaultAutoLimit,
        manualLimit: defaultManualLimit,
        lastUpdatedIso: nowIso,
        history: [
          ...(Array.isArray(parsed.history) ? parsed.history.slice(-10) : []),
          {
            date: parsed.date,
            autoRequests: parsed.autoRequests || 0,
            manualRequests: parsed.manualRequests || 0,
            totalRequests: parsed.totalRequests || 0,
          },
        ],
      };
      return { ok: true, data: rolloverRecord, rolledOver: true };
    }

    parsed.autoLimit = Number(options.autoLimit ?? deps.autoLimit ?? env.DAILY_EXTERNAL_REQ_LIMIT_AUTO ?? parsed.autoLimit ?? 0);
    parsed.manualLimit = Number(options.manualLimit ?? deps.manualLimit ?? env.DAILY_EXTERNAL_REQ_LIMIT_MANUAL ?? parsed.manualLimit ?? 50);

    return { ok: true, data: parsed };
  } catch (err) {
    console.warn(`[BUDGET STORE FAIL_CLOSED] Erro ao ler/parsear arquivo de orçamento diário (${err.message}). Bloqueando requisições externas.`);
    return {
      ok: false,
      error: err.message,
      failClosed: true,
      reason: 'corrupted_or_inaccessible_budget_store',
    };
  }
}

/**
 * Ordem 050: Gravação atômica do registro de orçamento diário com rotação segura
 */
function atomicSaveDailyBudget(record, deps = {}, options = {}) {
  if (deps.failBudgetSave) {
    return { ok: false, error: 'simulated_save_failure' };
  }
  if (deps.inMemoryBudget) {
    deps.inMemoryBudget = { ...record };
    return { ok: true };
  }

  const budgetFile = resolveBudgetFilePath(deps, options);
  const fsModule = deps.fs || fs;
  const tmpFile = `${budgetFile}.tmp.${process.pid}.${Date.now()}`;

  try {
    const payload = JSON.stringify(record, null, 2);
    fsModule.writeFileSync(tmpFile, payload, 'utf-8');
    fsModule.renameSync(tmpFile, budgetFile);
    return { ok: true };
  } catch (err) {
    try {
      if (fsModule.existsSync(tmpFile)) fsModule.unlinkSync(tmpFile);
    } catch {}
    console.error(`[BUDGET SAVE ERROR] Falha ao persistir orçamento diário (${err.message}).`);
    return { ok: false, error: err.message };
  }
}

/**
 * Ordem 050: Contabilização e reserva de requisições externas ANTES do envio.
 * Previne estouro de cotas sob concorrência e assegura valor inicial de ZERO chamadas automáticas.
 * Diferencia 'manual' vs 'auto' com fail-closed estrito.
 */
function reserveExternalRequest(kind = 'auto', deps = {}, options = {}) {
  const pauseCheck = isWorkerPaused(deps, options);
  if (pauseCheck.paused) {
    return {
      allowed: false,
      reason: 'worker_paused',
      message: `Requisição externa bloqueada por kill-switch ativo (${pauseCheck.reason}).`,
      failClosed: true,
    };
  }

  // Se fetch for um mock injetado em teste e nenhum arquivo/memória de orçamento foi especificado,
  // permite a execução do mock sem poluir ou esgotar o orçamento em disco do host.
  const isMockWithoutBudget = Boolean(
    deps.fetch &&
    deps.fetch !== globalThis.fetch &&
    !options.budgetFilePath &&
    !deps.budgetFilePath &&
    !deps.inMemoryBudget &&
    !options.enforceBudgetInMock &&
    !deps.enforceBudgetInMock
  );

  if (isMockWithoutBudget) {
    return {
      allowed: true,
      kind: kind === 'manual' ? 'manual' : 'auto',
      currentCount: 0,
      limit: 9999,
      totalRequests: 0,
      reservationId: `mock-${Date.now()}`,
      isMock: true,
    };
  }

  const budgetRead = readDailyBudget(deps, options);
  if (!budgetRead.ok) {
    return {
      allowed: false,
      reason: budgetRead.reason || 'budget_read_failed',
      error: budgetRead.error,
      failClosed: true,
    };
  }

  const record = budgetRead.data;
  const requestedKind = kind === 'manual' ? 'manual' : 'auto';

  if (requestedKind === 'auto') {
    if (record.autoRequests + 1 > record.autoLimit) {
      return {
        allowed: false,
        reason: 'daily_auto_limit_exceeded',
        kind: 'auto',
        currentCount: record.autoRequests,
        limit: record.autoLimit,
        message: `Limite diário de requisições automáticas atingido (${record.autoRequests}/${record.autoLimit}). Operações automáticas bloqueadas.`,
      };
    }
  } else {
    if (record.manualRequests + 1 > record.manualLimit) {
      return {
        allowed: false,
        reason: 'daily_manual_limit_exceeded',
        kind: 'manual',
        currentCount: record.manualRequests,
        limit: record.manualLimit,
        message: `Limite diário de requisições manuais atingido (${record.manualRequests}/${record.manualLimit}). Operação manual bloqueada.`,
      };
    }
  }

  if (requestedKind === 'auto') {
    record.autoRequests += 1;
  } else {
    record.manualRequests += 1;
  }
  record.totalRequests = (record.autoRequests || 0) + (record.manualRequests || 0);
  record.lastUpdatedIso = deps.nowIso ? deps.nowIso() : new Date().toISOString();

  const saveRes = atomicSaveDailyBudget(record, deps, options);
  if (!saveRes.ok) {
    return {
      allowed: false,
      reason: 'budget_save_failed',
      error: saveRes.error,
      failClosed: true,
      message: 'Falha ao persistir reserva de cota em disco. Requisição bloqueada por fail-closed.',
    };
  }

  return {
    allowed: true,
    kind: requestedKind,
    currentCount: requestedKind === 'auto' ? record.autoRequests : record.manualRequests,
    limit: requestedKind === 'auto' ? record.autoLimit : record.manualLimit,
    totalRequests: record.totalRequests,
    reservationId: `${requestedKind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
}

/**
 * Ordem 050: Retorna o status consolidado de governança de consumo e kill-switch
 */
function getDailyBudgetStatus(deps = {}, options = {}) {
  const pauseCheck = isWorkerPaused(deps, options);
  const budgetRead = readDailyBudget(deps, options);

  return {
    pauseState: pauseCheck,
    budgetState: budgetRead.ok ? budgetRead.data : null,
    budgetError: budgetRead.ok ? null : budgetRead.error,
  };
}

/**
 * Ordem 050: Reset administrativo do contador diário (para uso em testes ou manutenção)
 */
function resetDailyBudget(deps = {}, options = {}) {
  const nowIso = deps.nowIso ? deps.nowIso() : new Date().toISOString();
  const todayDate = nowIso.slice(0, 10);
  const env = deps.env || process.env;

  const resetRecord = {
    date: todayDate,
    autoRequests: 0,
    manualRequests: 0,
    totalRequests: 0,
    autoLimit: Number(options.autoLimit ?? deps.autoLimit ?? env.DAILY_EXTERNAL_REQ_LIMIT_AUTO ?? 0),
    manualLimit: Number(options.manualLimit ?? deps.manualLimit ?? env.DAILY_EXTERNAL_REQ_LIMIT_MANUAL ?? 50),
    lastUpdatedIso: nowIso,
    history: [],
  };

  return atomicSaveDailyBudget(resetRecord, deps, options);
}

// P1-01: Mapa completo de tenants suportados oficialmente pela plataforma HelpUS
const TENANTS = {
  brayyan: {
    name: 'Brayyan — Revisão Sistemática com IA',
    repo: 'HelpUSA/brayyan',
    domain: 'brayyan.helpusbr.com',
    vercelProject: 'brayyan',
    deployHook: process.env.VERCEL_DEPLOY_HOOK_BRAYYAN || null
  },
  publicarte: {
    name: 'Public Arte',
    repo: 'HelpUSA/publicarte',
    domain: 'publicarte.helpusbr.com',
    vercelProject: 'publicarte',
    deployHook: process.env.VERCEL_DEPLOY_HOOK_PUBLICARTE || null
  },
  usmle: {
    name: 'USMLE Platform',
    repo: 'HelpUSA/usmle',
    domain: 'usmle.helpusbr.com',
    vercelProject: 'usmle',
    deployHook: process.env.VERCEL_DEPLOY_HOOK_USMLE || null
  },
  studionaldohair: {
    name: 'Studio Naldo Hair',
    repo: 'HelpUSA/studionaldohair',
    domain: 'studionaldohair.helpusbr.com',
    vercelProject: 'studionaldohair',
    deployHook: process.env.VERCEL_DEPLOY_HOOK_STUDIONALDOHAIR || null
  },
  aidoctor: {
    name: 'AIDoctor — Inteligência Artificial Clínica',
    repo: 'HelpUSA/aidoctor',
    domain: 'aidoctor.helpusbr.com',
    vercelProject: 'aidoctor',
    deployHook: process.env.VERCEL_DEPLOY_HOOK_AIDOCTOR || null
  }
};

let cloudSha = null;

// Reconciliação causal de ciclo de vida e estado (P0 Quarta Auditoria)
// P0-01 (Quinta Auditoria): Reconciliação causal baseada EXCLUSIVAMENTE em eventos estruturados autorizados
// Mensagens de texto são apenas camada de apresentação; nunca autoridade de governança
function reconcileTicketLifecycle(localT, remoteT, mergedEvents) {
  // 1. Inspecionar o log cronológico de eventos estruturados autorizados de trás para frente
  if (Array.isArray(mergedEvents) && mergedEvents.length > 0) {
    for (let i = mergedEvents.length - 1; i >= 0; i--) {
      const evt = mergedEvents[i];
      if (!evt || !evt.authorized) continue;
      const integrity = verifyTicketEventIntegrity(evt);
      if (!integrity.valid) {
        console.warn(`[WATCHER EVENT REJECTED] Evento ${evt.id} (${evt.type}) descartado: ${integrity.reason}`);
        continue;
      }

      // Reabertura legítima comprovada pelo Master SuperAdmin ou solicitada pelo Cliente
      if (evt.type === 'ticket_reset_by_master' || evt.type === 'ticket_reopened_by_client') {
        return {
          status: 'pending_approval',
          progressPercentage: 0,
          reopenedAt: evt.timestamp,
        };
      }

      // Resolução / Conclusão comprovada em produção
      if (evt.type === 'ticket_resolved') {
        return {
          status: 'resolved',
          progressPercentage: 100,
        };
      }

      // Etapas de produção comprovadas
      if (evt.type === 'production_step') {
        return {
          status: 'in_production',
          progressPercentage: evt.progressPercentage || 0,
        };
      }

      // Aprovação inicial pelo Master SuperAdmin
      if (evt.type === 'master_approved') {
        return {
          status: 'in_production',
          progressPercentage: 0,
        };
      }

      // Recusa ou Cancelamento
      if (evt.type === 'ticket_rejected') {
        return {
          status: 'rejected',
          progressPercentage: 0,
        };
      }

      if (evt.type === 'ticket_cancelled') {
        return {
          status: 'closed',
          progressPercentage: 0,
        };
      }
    }
  }

  // 2. Fallback caso não existam eventos estruturados históricos: versão com updatedAt mais recente
  const localUpdated = localT.updatedAt || '';
  const remoteUpdated = remoteT.updatedAt || '';
  const newest = localUpdated >= remoteUpdated ? localT : remoteT;

  return {
    status: newest.status,
    progressPercentage: newest.progressPercentage || 0,
    reopenedAt: newest.reopenedAt,
  };
}

// Reconciliação granular de tickets com máquina de estados causal (P0 Quarta Auditoria)
function mergeTicketsGranular(remoteTickets, localTickets) {
  const map = new Map();

  for (const t of (remoteTickets || [])) {
    map.set(t.id, { ...t, messages: [...(t.messages || [])], events: [...(t.events || [])] });
  }

  for (const localT of (localTickets || [])) {
    const remoteT = map.get(localT.id);
    if (!remoteT) {
      map.set(localT.id, { ...localT, messages: [...(localT.messages || [])], events: [...(localT.events || [])] });
    } else {
      const mergedMessagesMap = new Map();
      for (const m of (remoteT.messages || [])) {
        const key = `${m.id || ''}_${m.createdAt || ''}_${m.senderId || ''}_${m.content || ''}`;
        mergedMessagesMap.set(key, m);
      }
      for (const m of (localT.messages || [])) {
        const key = `${m.id || ''}_${m.createdAt || ''}_${m.senderId || ''}_${m.content || ''}`;
        mergedMessagesMap.set(key, m);
      }

      const mergedMessages = Array.from(mergedMessagesMap.values()).sort((a, b) =>
        (a.createdAt || '').localeCompare(b.createdAt || '')
      );

      // P0-01 (Quinta Auditoria): Mesclar e preservar 100% dos eventos estruturados de governança
      const mergedEventsMap = new Map();
      for (const e of (remoteT.events || [])) {
        if (verifyTicketEventIntegrity(e).valid) {
          const key = e.id || e.idempotencyKey || `${e.type}_${e.timestamp}_${e.actorEmail}`;
          mergedEventsMap.set(key, e);
        }
      }
      for (const e of (localT.events || [])) {
        if (verifyTicketEventIntegrity(e).valid) {
          const key = e.id || e.idempotencyKey || `${e.type}_${e.timestamp}_${e.actorEmail}`;
          mergedEventsMap.set(key, e);
        }
      }
      const mergedEvents = Array.from(mergedEventsMap.values()).sort((a, b) =>
        (a.timestamp || '').localeCompare(b.timestamp || '')
      );

      // Reconciliação causal baseada EXCLUSIVAMENTE em eventos estruturados autorizados
      const lifecycle = reconcileTicketLifecycle(localT, remoteT, mergedEvents);
      const localUpdated = localT.updatedAt || '';
      const remoteUpdated = remoteT.updatedAt || '';
      const baseTicket = (localUpdated >= remoteUpdated) ? localT : remoteT;

      map.set(localT.id, {
        ...baseTicket,
        status: lifecycle.status,
        progressPercentage: lifecycle.progressPercentage,
        reopenedAt: lifecycle.reopenedAt || baseTicket.reopenedAt,
        messages: mergedMessages,
        events: mergedEvents,
      });
    }
  }

  return Array.from(map.values());
}

async function getGitHubHeaders(deps = {}, options = {}) {
  const token = resolveServiceWorkerToken(deps, options);
  const headers = {
    'User-Agent': 'Antigravity-Watchdog',
    'Accept': 'application/vnd.github+json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Ordem 039: Sanitização segura de URLs para logs sem vazamento de tokens ou segredos
function safeSanitizeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return 'internal_url';
  try {
    const parsed = new URL(urlStr);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return 'sanitized_endpoint';
  }
}

// Ordem 039: Leitura resiliente de respostas HTTP com logs de auditoria seguros (status, content-type, origem)
async function safeParseHttpResponse(res, context = 'API') {
  if (!res) {
    return { ok: false, error: 'null_response', status: 0, contentType: 'none', origin: 'none' };
  }

  const status = typeof res.status === 'number' ? res.status : 0;
  const contentType = (res.headers?.get?.('content-type') || res.headers?.get?.('Content-Type') || 'unknown').toLowerCase();
  const origin = safeSanitizeUrl(res.url);

  // Compatibilidade com fetch padrão (res.text) e mocks que implementam apenas res.json()
  if (typeof res.text === 'function') {
    let text = '';
    try {
      text = await res.text();
    } catch (readErr) {
      console.warn(`[WATCHDOG SAFE_HTTP] Falha ao extrair payload de ${origin} (status: ${status}, content-type: ${contentType}): ${readErr.message}`);
      return { ok: false, error: 'body_read_failed', status, contentType, origin };
    }

    const trimmed = (text || '').trim();
    if (trimmed.length === 0) {
      console.warn(`[WATCHDOG SAFE_HTTP] Resposta HTTP vazia recebida de ${origin} (status: ${status}, content-type: ${contentType}, bytes: 0).`);
      return { ok: false, error: 'empty_response_body', status, contentType, origin, isEmpty: true };
    }

    try {
      const parsed = JSON.parse(trimmed);
      return { ok: true, data: parsed, status, contentType, origin };
    } catch (parseErr) {
      console.warn(`[WATCHDOG SAFE_HTTP] JSON malformado de ${origin} (status: ${status}, content-type: ${contentType}, bytes: ${trimmed.length}): ${parseErr.message}`);
      return { ok: false, error: 'invalid_json', status, contentType, origin, parseError: parseErr.message };
    }
  } else if (typeof res.json === 'function') {
    try {
      const parsedData = await res.json();
      return { ok: true, data: parsedData, status, contentType, origin };
    } catch (jsonErr) {
      console.warn(`[WATCHDOG SAFE_HTTP] Falha ao interpretar res.json de ${origin} (status: ${status}, content-type: ${contentType}): ${jsonErr.message}`);
      return { ok: false, error: 'invalid_json', status, contentType, origin, parseError: jsonErr.message };
    }
  }

  return { ok: false, error: 'unsupported_response_type', status, contentType, origin };
}
// P1-02 & Ordem 039: Retorna null em falha de rede/API com parsing seguro de HTTP/JSON sem throws de Unexpected end of JSON
async function fetchTickets(deps = {}, options = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const now = typeof deps.now === "function" ? deps.now() : (deps.now || Date.now());

  // 1. Ordem 041: Se o backoff estiver ativo (devido a 403/429 ou cota esgotada), suspende imediatamente
  if (isRateLimitBackoffActive(now)) {
    const remainingWaitMs = rateLimitState.backoffUntilMs - now;
    console.warn("[WATCHDOG BACKOFF] Polling suspenso. Backoff ativo por mais " + Math.round(remainingWaitMs / 1000) + "s devido a limite de taxa ou HTTP 403/429 prévio.");
    return null;
  }

  // 2. Ordem 041: Fail-Closed se nenhuma credencial de serviço estiver configurada.
  // Impede que requisições não autenticadas ocorram em loop e esgotem a cota pública de IP do host.
  const token = resolveServiceWorkerToken(deps, options);
  if (!token) {
    console.warn("[WATCHDOG AUTH FAIL_CLOSED] Nenhuma credencial de serviço configurada (SERVICE_WORKER_GITHUB_TOKEN). Polling cancelado para proteger cotas do host.");
    return null;
  }

  // 3. Ordem 050: Governança de consumo, verificação de kill-switch e reserva de cota diária
  const reqKind = options.kind || (options.isManual || deps.isManual ? 'manual' : (options.isContinuous || deps.isContinuous || options.isAuto || deps.isAuto ? 'auto' : 'manual'));
  const reservation = reserveExternalRequest(reqKind, deps, options);
  if (!reservation.allowed) {
    console.warn(`[WATCHDOG GOVERNANCE] Requisição fetchTickets cancelada (${reservation.reason}). Limite: ${reservation.limit}, Atual: ${reservation.currentCount || 0}.`);
    return null;
  }

  let hasError = false;

  // 3. Consulta Contents API no GitHub com parsing seguro e logs de auditoria
  try {
    const headers = await getGitHubHeaders(deps, options);
    const res = await fetchFn(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`, { headers, cache: "no-store" });

    if (res) {
      updateRateLimitFromResponse(res, now);
    }

    if (res && res.status === 404) {
      return []; // Base legítima ainda não criada
    }

    if (res && (res.status === 403 || res.status === 429)) {
      console.warn("[WATCHDOG RATE_LIMIT] GitHub Contents API rejeitou requisição com HTTP " + res.status + ". Fallback raw cancelado por política de rate limit.");
      return null;
    }

    if (res && res.ok) {
      const parsedHttp = await safeParseHttpResponse(res, 'GitHub Contents API');
      if (parsedHttp.ok && parsedHttp.data) {
        const data = parsedHttp.data;
        if (data.sha) {
          cloudSha = data.sha;
        }
        if (typeof data.content === 'string') {
          const trimmedB64 = data.content.trim();
          if (trimmedB64.length === 0) {
            console.warn(`[WATCHDOG SAFE_HTTP] Conteúdo base64 vazio no arquivo ${DB_PATH}.`);
            return [];
          }
          try {
            const content = Buffer.from(trimmedB64, 'base64').toString('utf-8').trim();
            if (!content || content.length === 0) {
              console.warn(`[WATCHDOG SAFE_HTTP] Conteúdo decodificado de ${DB_PATH} vazio.`);
              return [];
            }
            const parsedArray = JSON.parse(content);
            if (Array.isArray(parsedArray)) {
              return parsedArray;
            }
          } catch (contentErr) {
            console.warn(`[WATCHDOG SAFE_HTTP] Falha ao decodificar/parsear conteúdo de ${DB_PATH}: ${contentErr.message}`);
            hasError = true;
          }
        } else if (Array.isArray(data)) {
          return data;
        }
      } else {
        hasError = true;
      }
    } else {
      const status = res ? res.status : 0;
      console.warn(`[WATCHDOG SAFE_HTTP] GitHub API contents retornou HTTP ${status}. Tentando fallback raw.`);
      hasError = true;
    }
  } catch (e) {
    console.warn('[WATCHDOG SAFE_HTTP] Exceção na Contents API:', e.message);
    hasError = true;
  }

  // 4. Fallback resiliente para raw.githubusercontent.com SOMENTE se não for erro de rate limit
  if (hasError && !isRateLimitBackoffActive(now)) {
  try {
    const res = await fetchFn(`https://raw.githubusercontent.com/${DB_REPO}/main/${DB_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (res && res.status === 404) {
      return [];
    }
    if (res && res.ok) {
      const rawParsed = await safeParseHttpResponse(res, 'GitHub Raw');
      if (rawParsed.ok && Array.isArray(rawParsed.data)) {
        return rawParsed.data;
      } else {
        hasError = true;
      }
    } else {
      hasError = true;
    }
  } catch (e) {
    console.warn('[WATCHDOG SAFE_HTTP] Exceção no fallback raw:', e.message);
    hasError = true;
  }
  }

  if (hasError) {
    console.warn('[WATCHDOG ALERT] Falha ao consultar banco remoto. Retornando null para preservar dados locais e evitar sobrescrita.');
    return null;
  }
  return [];
}

// P0-02 & P0-04: Reconciliação em nível de operação com CAS e retries sem perda de dados
async function saveTickets(tickets, maxRetries = 3, deps = {}, options = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const token = resolveServiceWorkerToken(deps, options);

  if (!token) {
    console.warn('[WATCHDOG SECURITY] Credencial de serviço não configurada. Salvamento remoto no GitHub Cloud suspenso.');
    return false;
  }

  // Ordem 050: Governança de consumo, verificação de kill-switch e reserva de cota diária
  const reqKind = options.kind || (options.isManual || deps.isManual ? 'manual' : (options.isContinuous || deps.isContinuous || options.isAuto || deps.isAuto ? 'auto' : 'manual'));
  const reservation = reserveExternalRequest(reqKind, deps, options);
  if (!reservation.allowed) {
    console.warn(`[WATCHDOG GOVERNANCE] Salvamento saveTickets cancelado (${reservation.reason}). Limite: ${reservation.limit}, Atual: ${reservation.currentCount || 0}.`);
    return false;
  }

  let attempt = 0;
  let currentTickets = [...tickets];

  while (attempt < maxRetries) {
    attempt++;
    try {
      const headers = {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Antigravity-Watchdog',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json'
      };

      let latestSha = undefined;
      const check = await fetchFn(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`, { headers, cache: 'no-store' });
      if (check.ok) {
        const d = await check.json();
        latestSha = d.sha;
        cloudSha = d.sha;
      } else if (check.status !== 404) {
        console.error(`[WATCHDOG] Check SHA failed status ${check.status}`);
        return false;
      }

      const res = await fetchFn(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `db(watchdog): update tickets execution progress (attempt ${attempt})`,
          content: Buffer.from(JSON.stringify(currentTickets, null, 2), 'utf-8').toString('base64'),
          sha: latestSha || cloudSha || undefined,
          branch: 'main'
        })
      });

      if (res.ok) {
        const d = await res.json();
        cloudSha = d?.content?.sha || cloudSha;
        console.log('[WATCHDOG] Saved tickets database to GitHub Cloud!');
        return true;
      }

      // Tratamento de conflito 409 (CAS) com Reconciliação Granular (P0-02 & P0-04 & P1)
      if (res.status === 409) {
        console.warn(`[WATCHDOG CAS] Conflito 409 detectado na tentativa ${attempt}. Reconciliando granularmente com banco remoto...`);
        const fresh = await fetchTickets(deps);
        if (!fresh || !Array.isArray(fresh)) {
          console.error(`[WATCHDOG CAS ABORT] Re-fetch falhou durante conflito 409 na tentativa ${attempt}. Abortando retry para evitar corrupção de snapshot.`);
          return false;
        }
        currentTickets = mergeTicketsGranular(fresh, currentTickets);
        continue;
      }

      const errText = await res.text();
      console.error(`[WATCHDOG] GitHub API PUT failed status ${res.status}:`, errText);
      return false;
    } catch (e) {
      console.error(`[WATCHDOG] Save error (attempt ${attempt}):`, e.message);
      if (attempt >= maxRetries) return false;
    }
  }
  return false;
}

// P0-A: Verificador estrito de procedência de commit no GitHub (Fail-closed; sem fallback por string)
async function verifyCommit(tenant, commitSha, deps = {}, options = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const token = resolveServiceWorkerToken(deps, options);

  if (!commitSha || typeof commitSha !== 'string' || !/^[0-9a-f]{7,40}$/i.test(commitSha)) {
    return { valid: false, reason: 'invalid_sha_format' };
  }

  if (!tenant || !tenant.repo) {
    return { valid: false, reason: 'missing_tenant_repo' };
  }

  if (deps.verifyCommitFn) {
    return await deps.verifyCommitFn(tenant, commitSha);
  }

  // P0-A: Rejeitar qualquer comprovação fictícia ou offline. Consulta remota obrigatória.
  if (!token) {
    return { valid: false, reason: 'unverified_commit_remote_check_required_no_token' };
  }

  // Ordem 050: Governança de consumo, verificação de kill-switch e reserva de cota diária
  const reqKind = options.kind || (options.isManual || deps.isManual ? 'manual' : (options.isContinuous || deps.isContinuous || options.isAuto || deps.isAuto ? 'auto' : 'manual'));
  const reservation = reserveExternalRequest(reqKind, deps, options);
  if (!reservation.allowed) {
    return { valid: false, reason: reservation.reason };
  }

  try {
    const url = `https://api.github.com/repos/${tenant.repo}/commits/${commitSha}`;
    const res = await fetchFn(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Antigravity-Watchdog',
        'Accept': 'application/vnd.github+json'
      }
    });

    if (!res.ok) {
      return { valid: false, reason: `commit_not_found_on_github_status_${res.status}` };
    }
    const data = await res.json();
    if (!data.sha || !data.sha.toLowerCase().startsWith(commitSha.toLowerCase())) {
      return { valid: false, reason: 'commit_sha_mismatch' };
    }
    return { valid: true, fullSha: data.sha, message: data.commit?.message };
  } catch (e) {
    return { valid: false, reason: `github_api_error: ${e.message}` };
  }
}

// P0-B: Verificador rigoroso de procedência e status READY do deployment na Vercel
async function verifyDeployment(tenant, options = {}, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;

  if (deps.verifyDeploymentFn) {
    return await deps.verifyDeploymentFn(tenant, options);
  }

  // P0-B: Exigência obrigatória de commit SHA esperado
  const expectedSha = options.expectedSha;
  if (!expectedSha) {
    return { ready: false, reason: 'missing_expected_commit_sha' };
  }

  // 1. Verificação via Vercel Deployments API com comprovação estrita de Projeto, Target e SHA
  if (options.deploymentId && (options.vercelToken || process.env.VERCEL_TOKEN)) {
    const vToken = (options.vercelToken || process.env.VERCEL_TOKEN).trim();
    try {
      const url = `https://api.vercel.com/v13/deployments/${options.deploymentId}`;
      const res = await fetchFn(url, {
        headers: { 'Authorization': `Bearer ${vToken}` }
      });
      if (res.ok) {
        const d = await res.json();
        const state = d.status || d.readyState;

        // P0-B: Status deve ser estritamente READY
        if (state !== 'READY') {
          return { ready: false, reason: `deployment_status_${state}` };
        }

        // P0-B: Target deve ser estritamente 'production' (rejeita preview e target ausente)
        if (d.target !== 'production') {
          return { ready: false, reason: `invalid_target_${d.target || 'missing'}` };
        }

        // Quarta Auditoria (Hardening): Correlacionar projeto Vercel e tenant
        const expectedProject = options.expectedProject || tenant.vercelProject;
        if (expectedProject) {
          const nameMatches = d.name && d.name === expectedProject;
          const idMatches = d.projectId && d.projectId === expectedProject;
          if (!nameMatches && !idMatches) {
            return { ready: false, reason: 'project_mismatch_' + (d.name || d.projectId || 'unknown') };
          }
        }

        // P0-B: Commit SHA do deployment deve corresponder estritamente ao commit aprovado
        const deploySha = d.meta?.githubCommitSha || d.meta?.commitSha;
        if (!deploySha || !deploySha.toLowerCase().startsWith(expectedSha.toLowerCase())) {
          return { ready: false, reason: `commit_sha_mismatch_deployment_${deploySha || 'missing'}` };
        }

        return { ready: true, deploymentId: d.id, url: d.url, target: d.target, sha: deploySha, project: d.name || d.projectId };
      }
      return { ready: false, reason: `vercel_api_error_${res.status}` };
    } catch (e) {
      return { ready: false, reason: e.message };
    }
  }

  // 2. Verificação via Smoke Test Funcional Específico com Prova Criptográfica/Versionada de SHA
  if (options.smokeTestSpecific) {
    try {
      const targetUrl = options.smokeTestSpecific.url || `https://${tenant.domain}/api/version`;
      const res = await fetchFn(targetUrl, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        // Quarta Auditoria: Rejeitar assertFn arbitrária sem comprovação de versão/commit
        const serverSha = res.headers?.get?.('x-commit-sha') || res.headers?.get?.('x-version');
        if (serverSha && serverSha.toLowerCase().startsWith(expectedSha.toLowerCase())) {
          return { ready: true, method: 'smoke_test_commit_header_verified', status: res.status, sha: serverSha };
        }

        // Verificar se payload JSON contém commitSha correspondente
        try {
          const bodyJson = await res.json();
          const bodySha = bodyJson?.commitSha || bodyJson?.sha || bodyJson?.version;
          if (bodySha && typeof bodySha === 'string' && bodySha.toLowerCase().startsWith(expectedSha.toLowerCase())) {
            return { ready: true, method: 'smoke_test_body_sha_verified', status: res.status, sha: bodySha };
          }
        } catch (_) {}

        return { ready: false, reason: 'smoke_test_lacks_commit_provenance' };
      }
      return { ready: false, reason: `smoke_test_failed_status_${res.status}` };
    } catch (e) {
      return { ready: false, reason: `smoke_test_error: ${e.message}` };
    }
  }

  // 3. Verificador injetado por proveniência
  if (typeof options.provenanceVerifier === 'function') {
    return await options.provenanceVerifier(tenant, options);
  }

  // P0-B: Rejeita HTTP 200 genérico de domínio raiz e flags booleanas sem identidade
  return { ready: false, reason: 'unverified_deployment_provenance_strict' };
}

async function processTicket(ticket, options = {}, deps = {}) {
  console.log(`\n🚀 [WATCHDOG ANTIGRAVITY] DETECTADO CHAMADO EM PRODUÇÃO: [${ticket.code}] - "${ticket.title}"`);

  // P1-01: Rejeitar tenant desconhecido estritamente sem fallback
  const tenant = TENANTS[ticket.tenantId];
  if (!tenant) {
    const errorMsg = `[WATCHDOG SECURITY] Erro Crítico: Tenant desconhecido '${ticket.tenantId}' no chamado [${ticket.code}]. Fallback rejeitado por política de segurança.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Governança: Retenção para verificação quando allowAutonomousDeploy não estiver explícito
  if (options.dryRun || !options.allowAutonomousDeploy) {
    console.log(`[WATCHDOG] Chamado [${ticket.code}] para o tenant [${tenant.name}] validado contra a matriz de segurança. Execução direta retida para homologação de governança.`);
    return {
      success: true,
      verified: true,
      tenant: tenant.name,
      status: 'pending_verification'
    };
  }

  const updateCloud = async (percentage, stepMsg, solutionMsg, newStatus = 'in_production') => {
    const freshTickets = await fetchTickets(deps);
    if (!freshTickets || !Array.isArray(freshTickets)) {
      console.error(`[WATCHDOG ERROR] Falha ao recuperar tickets remotos para atualizar [${ticket.code}]. Abortando.`);
      return false;
    }

    const target = freshTickets.find((t) => t.id === ticket.id || t.code === ticket.code);
    if (!target) return false;
    if (target.status !== 'in_production' && target.status !== newStatus) {
      console.log(`[WATCHDOG] Chamado [${ticket.code}] alterado externamente (status: ${target.status}). Abortando.`);
      return false;
    }

    target.progressPercentage = percentage;
    target.progressStep = stepMsg;
    target.status = newStatus;
    target.updatedAt = new Date().toISOString();

    const msgContent = solutionMsg
      ? solutionMsg
      : `⚡ *[PROGRESSO REAL ${percentage}%]*: ${stepMsg}`;

    if (!Array.isArray(target.messages)) {
      target.messages = [];
    }

    target.messages.push({
      id: `msg-prg-${Date.now()}`,
      ticketId: target.id,
      senderId: percentage === 100 ? 'ia.engine@helpusbr.com' : 'ci.cd@helpusbr.com',
      senderName: percentage === 100 ? 'IA Autônoma (HelpUS Tech)' : 'Antigravity Execution Pipeline',
      senderRole: 'agent',
      isInternalNote: false,
      content: msgContent,
      createdAt: new Date().toISOString(),
    });

    target.events = Array.isArray(target.events) ? target.events : [];
    const pipeEvt = {
      id: `evt-pipe-${Date.now()}-${percentage}`,
      ticketId: target.id,
      type: percentage === 100 ? 'ticket_resolved' : 'production_step',
      actorEmail: percentage === 100 ? 'ia.engine@helpusbr.com' : 'ci.cd@helpusbr.com',
      actorRole: 'system_pipeline',
      authorized: true,
      progressPercentage: percentage,
      status: newStatus,
      note: stepMsg,
      timestamp: new Date().toISOString(),
      seq: (target.events?.length || 0) + 1,
    };
    pipeEvt.signature = signTicketEvent(pipeEvt);
    target.events.push(pipeEvt);

    return await saveTickets(freshTickets, 3, deps);
  };

  // Etapa 1: 25% - Análise e Requisitos Validados
  console.log(`[WATCHDOG] Executando validação de requisitos para ${tenant.name}...`);
  const ok25 = await updateCloud(25, `📥 Requisitos validados com sucesso para o tenant ${tenant.name} (${tenant.domain}).`);
  if (!ok25) {
    console.error(`[WATCHDOG P0-02] Falha ao persistir status 25% para [${ticket.code}]`);
    return { success: false, step: 25, error: 'cloud_save_failed_at_25' };
  }

  // Etapa 2: 50% - Validação de Código Comprovado (P0-03 & P0-01 Auditoria)
  const solutionCommitSha = options.verifiedSha || ticket.solutionCommitSha;
  if (!solutionCommitSha) {
    console.log(`[WATCHDOG P0-03] Chamado [${ticket.code}] aguardando commit de alteração de código real. Não assumindo conclusão nominal.`);
    const okHold = await updateCloud(25, `🛠️ Análise concluída. Aguardando implementação técnica e commit no repositório ${tenant.repo}...`);
    // P1-01 (Auditoria): Checar retorno de okHold estritamente
    if (!okHold) {
      console.error(`[WATCHDOG P1-01] Falha ao persistir estado de espera 25% para [${ticket.code}]`);
      return { success: false, step: 25, error: 'cloud_save_failed_at_hold' };
    }
    return { success: true, step: 25, status: 'in_production', note: 'Aguardando commit de alteração de código verificável' };
  }

  // P0-01: Verificação de procedência do commit no repositório GitHub
  const commitCheck = await verifyCommit(tenant, solutionCommitSha, deps);
  if (!commitCheck.valid) {
    console.warn(`[WATCHDOG P0-01] Commit ${solutionCommitSha} não comprovado no repositório ${tenant.repo} (motivo: ${commitCheck.reason}). Retendo avanço.`);
    const okHoldInvalid = await updateCloud(25, `⚠️ Commit ${solutionCommitSha} não comprovado no repositório ${tenant.repo} (${commitCheck.reason}). Retido na etapa de verificação.`);
    if (!okHoldInvalid) {
      return { success: false, step: 25, error: 'cloud_save_failed_at_invalid_commit_hold' };
    }
    return { success: false, step: 25, error: `unverified_commit: ${commitCheck.reason}` };
  }

  console.log(`[WATCHDOG] Código comprovado vinculado: commit ${solutionCommitSha} em ${tenant.repo}`);
  const ok50 = await updateCloud(50, `🛠️ Alteração técnica comprovada (commit ${solutionCommitSha.slice(0, 7)}) no repositório ${tenant.repo}.`);
  if (!ok50) {
    console.error(`[WATCHDOG P0-02] Falha ao persistir status 50% para [${ticket.code}]`);
    return { success: false, step: 50, error: 'cloud_save_failed_at_50' };
  }

  // Etapa 3: 75% - Disparo do Deploy Hook
  let deployTriggered = false;
  const fetchFn = deps.fetch || globalThis.fetch;
  const hookUrl = options.deployHook || tenant.deployHook;
  if (hookUrl) {
    try {
      const hookRes = await fetchFn(hookUrl, { method: 'POST' });
      deployTriggered = hookRes.ok;
      console.log(`[WATCHDOG] Deploy Hook disparado para ${tenant.domain}: HTTP ${hookRes.status}`);
    } catch (e) {
      console.warn('[WATCHDOG] Vercel deploy hook error:', e.message);
    }
  }

  if (!deployTriggered) {
    console.log(`[WATCHDOG] Deploy hook ausente ou falhou para ${tenant.domain}. Mantendo em homologação.`);
    return { success: true, step: 50, status: 'in_production', note: 'Deploy hook ausente ou com falha' };
  }

  const ok75 = await updateCloud(75, `⚡ Deploy acionado na Vercel Cloud para ${tenant.domain}. Aguardando homologação de publicação READY...`);
  if (!ok75) {
    console.error(`[WATCHDOG P0-02] Falha ao persistir status 75% para [${ticket.code}]`);
    return { success: false, step: 75, error: 'cloud_save_failed_at_75' };
  }

  // P0-01 (Auditoria): Verificação comprovada de publicação READY na Vercel
  const deployCheck = await verifyDeployment(tenant, { ...options, expectedSha: solutionCommitSha }, deps);
  if (deployCheck.ready) {
    const finalMsg = `✨ *[CONCLUÍDO & RESOLVIDO]*: A solicitação [${ticket.code}] foi processada com validação completa no tenant ${tenant.name} (${tenant.domain}) e confirmada como READY em produção.`;
    const ok100 = await updateCloud(100, `✅ Publicação confirmada e verificada como READY em ${tenant.domain}.`, finalMsg, 'resolved');
    if (!ok100) {
      console.error(`[WATCHDOG P0-02] Falha ao persistir status 100% para [${ticket.code}]`);
      return { success: false, step: 100, error: 'cloud_save_failed_at_100' };
    }
    console.log(`🎉 [WATCHDOG ANTIGRAVITY] CHAMADO ${ticket.code} CONCLUÍDO COM SUCESSO VERIFICADO!`);
    return { success: true, step: 100, status: 'resolved', deployment: deployCheck };
  } else {
    console.log(`[WATCHDOG P0-01] Deploy hook aceito, mas deployment READY ainda pendente de validação (${deployCheck.reason || 'aguardando'}). Mantendo em homologação (75%).`);
    return {
      success: true,
      step: 75,
      status: 'in_production',
      note: `Deploy acionado; aguardando confirmação comprovada de deployment READY da plataforma (${deployCheck.reason || 'pendente'})`
    };
  }
}

// P0-AUTH (Ordem 031): Identidade de serviço com privilégios mínimos para o Watcher
function getServiceWorkerToken(expiresInSeconds = 300, options = {}) {
  const secret = getSessionSecret();
  const now = Math.floor(Date.now() / 1000);
  const tenantId = options.tenantId || 'all';
  const allowedTenantIds = options.allowedTenantIds || (tenantId === 'all' ? ['all'] : [tenantId]);
  const payload = {
    userId: options.userId || 'usr-service-worker-watcher',
    email: options.email || 'service.worker@helpusbr.com',
    role: 'service_worker',
    tenantId,
    allowedTenantIds,
    iat: now,
    exp: now + expiresInSeconds,
    iss: 'helpus-support-server'
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`v1.${payloadB64}`).digest('base64url');
  return `v1.${payloadB64}.${sig}`;
}

// P0-EXEC (Ordem 035): Fila durável com persistência de job/attempt, claim atômico, idempotência, ACK e recuperação pós-crash
class DurableClaimStore {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.HELPUS_CLAIMS_PATH || path.join(process.cwd(), 'data', 'helpus_claims_ledger.json');
    this.leaseDurationMs = options.leaseDurationMs || 60000;
    this.deps = options.deps || {};
    this.claims = new Map();
    this.loadClaims();
  }

  loadClaims() {
    if (this.deps.claimsStorage && typeof this.deps.claimsStorage.getClaims === 'function') {
      const data = this.deps.claimsStorage.getClaims();
      this.claims = new Map(Object.entries(data || {}));
      return;
    }
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.claims = new Map(Object.entries(parsed || {}));
      } else {
        this.claims = new Map();
      }
    } catch (_) {
      this.claims = new Map();
    }
  }

  saveClaims() {
    const obj = Object.fromEntries(this.claims.entries());
    if (this.deps.claimsStorage && typeof this.deps.claimsStorage.saveClaims === 'function') {
      this.deps.claimsStorage.saveClaims(obj);
      return;
    }
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.storagePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
      fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.storagePath);
    } catch (_) {
      try {
        const osTmp = require('os').tmpdir();
        const fallbackPath = path.join(osTmp, 'helpus_claims_ledger.json');
        fs.writeFileSync(fallbackPath, JSON.stringify(obj, null, 2), 'utf-8');
      } catch (err) {}
    }
  }

  getClaim(ticketId) {
    this.loadClaims();
    return this.claims.get(ticketId) || null;
  }

  acquireClaim(ticketId, currentStatus, options = {}) {
    this.loadClaims();
    const now = options.now || Date.now();
    const durationMs = options.durationMs || this.leaseDurationMs;
    const workerId = options.workerId || 'worker-antigravity-node';

    const existing = this.claims.get(ticketId);

    // 1. Idempotência / Checagem de claim ativo e estados de ciclo de vida (Ordem 039)
    if (existing) {
      const isUnexpired = existing.leaseExpiresAt && new Date(existing.leaseExpiresAt).getTime() > now;
      if (isUnexpired && existing.status === 'claimed') {
        return {
          acquired: false,
          reason: 'active_claim_held',
          attemptId: existing.attemptId,
          fencingToken: existing.fencingToken,
          leaseExpiresAt: existing.leaseExpiresAt
        };
      }

      // Ordem 039: pending_verification / deferred NÃO equivale a completed!
      if (existing.status === 'deferred') {
        if (!options.allowAutonomousDeploy) {
          return {
            acquired: false,
            reason: 'held_pending_governance_verification',
            status: 'deferred',
            attemptId: existing.attemptId,
            fencingToken: existing.fencingToken,
            deferredReason: existing.deferredReason || 'pending_verification',
            result: existing.result
          };
        }
      }

      // Conclusão comprovada (completed)
      if (existing.status === 'completed' && existing.ticketStatus === currentStatus) {
        return {
          acquired: false,
          reason: 'already_completed',
          status: 'completed',
          attemptId: existing.attemptId,
          fencingToken: existing.fencingToken,
          result: existing.result
        };
      }
    }

    // 2. Claim Atômico com Fencing Token Monotônico
    const fencingToken = (existing?.fencingToken || 0) + 1;
    const attemptId = `att-${now}-${crypto.randomBytes(4).toString('hex')}`;
    const leaseExpiresAt = new Date(now + durationMs).toISOString();

    const claimRecord = {
      ticketId,
      attemptId,
      fencingToken,
      workerId,
      status: 'claimed',
      ticketStatus: currentStatus,
      claimedAt: new Date(now).toISOString(),
      leaseExpiresAt,
      completedAt: null,
      deferredAt: null,
      deferredReason: null,
      acknowledgedAt: null,
      result: null,
      lastError: null,
      retryCount: (existing?.retryCount || 0) + (existing?.status === 'failed' || existing?.status === 'recovered' ? 1 : 0)
    };

    this.claims.set(ticketId, claimRecord);
    this.saveClaims();

    return {
      acquired: true,
      attemptId,
      fencingToken,
      leaseExpiresAt,
      workerId
    };
  }

  // Ordem 039: Conclusão verificada comprovada (somente quando 100% resolvido com recibos)
  completeClaim(ticketId, attemptId, result = {}, options = {}) {
    this.loadClaims();
    const now = options.now || Date.now();
    const claim = this.claims.get(ticketId);

    if (!claim) return { completed: false, reason: 'claim_not_found' };
    if (claim.attemptId !== attemptId) return { completed: false, reason: 'stale_attempt_or_fencing_mismatch', currentAttemptId: claim.attemptId };

    claim.status = 'completed';
    claim.completedAt = new Date(now).toISOString();
    claim.result = result;
    claim.lastError = null;
    this.saveClaims();

    return { completed: true, attemptId, fencingToken: claim.fencingToken };
  }

  // Ordem 039: Retenção para verificação de governança (job NÃO finalizado; pendente de homologação humana)
  deferClaim(ticketId, attemptId, reason = 'pending_verification', result = {}, options = {}) {
    this.loadClaims();
    const now = options.now || Date.now();
    const claim = this.claims.get(ticketId);

    if (!claim) return { deferred: false, reason: 'claim_not_found' };
    if (claim.attemptId !== attemptId) return { deferred: false, reason: 'stale_attempt_or_fencing_mismatch', currentAttemptId: claim.attemptId };

    claim.status = 'deferred';
    claim.deferredAt = new Date(now).toISOString();
    claim.deferredReason = reason;
    claim.completedAt = null; // Estritamente NÃO completado
    claim.result = result;
    this.saveClaims();

    return { deferred: true, attemptId, fencingToken: claim.fencingToken, reason };
  }

  // Ordem 039: Semântica estrita de ACK: direciona conforme status real
  ackClaim(ticketId, attemptId, result = {}, options = {}) {
    this.loadClaims();
    const now = options.now || Date.now();
    const claim = this.claims.get(ticketId);

    if (!claim) {
      return { acked: false, reason: 'claim_not_found' };
    }

    if (claim.attemptId !== attemptId) {
      return { acked: false, reason: 'stale_attempt_or_fencing_mismatch', currentAttemptId: claim.attemptId };
    }

    // Se o resultado for de retenção de governança, deferir
    if (result && (result.status === 'pending_verification' || result.status === 'deferred')) {
      return this.deferClaim(ticketId, attemptId, result.status, result, options);
    }

    // Se o resultado for de conclusão real verificada
    if (result && (result.status === 'resolved' || result.status === 'completed' || result.progressPercentage === 100 || result.buildStatus === 'ready' || result.completed === true)) {
      return this.completeClaim(ticketId, attemptId, result, options);
    }

    // Se for falha explícita
    if (result && (result.success === false || result.error)) {
      this.releaseClaim(ticketId, attemptId, result.error || 'execution_failed', options);
      return { acked: false, reason: 'job_failed', error: result.error };
    }

    // Reconhecimento intermediário (ex: 25% aguardando código)
    claim.status = 'acknowledged';
    claim.acknowledgedAt = new Date(now).toISOString();
    claim.completedAt = null;
    claim.result = result;
    this.saveClaims();

    return { acked: true, attemptId, fencingToken: claim.fencingToken, status: 'acknowledged' };
  }

  releaseClaim(ticketId, attemptId, reason = 'error', options = {}) {
    this.loadClaims();
    const now = options.now || Date.now();
    const claim = this.claims.get(ticketId);

    if (!claim) return false;
    if (claim.attemptId !== attemptId) return false;

    claim.status = 'failed';
    claim.lastError = reason;
    claim.leaseExpiresAt = new Date(now).toISOString();
    this.saveClaims();
    return true;
  }

  recoverOrphanedClaims(now = Date.now()) {
    this.loadClaims();
    const recovered = [];

    for (const [ticketId, claim] of this.claims.entries()) {
      if (claim.status === 'claimed') {
        const expiresMs = new Date(claim.leaseExpiresAt).getTime();
        if (expiresMs <= now) {
          claim.status = 'recovered';
          claim.lastError = 'recovered_from_crash_or_timeout';
          recovered.push({ ticketId, attemptId: claim.attemptId, fencingToken: claim.fencingToken });
        }
      }
    }

    if (recovered.length > 0) {
      this.saveClaims();
    }
    return recovered;
  }
}

const defaultClaimStore = new DurableClaimStore();

function getActiveClaimStore(deps = {}) {
  if (deps.claimStore) return deps.claimStore;
  if (deps.claimsStorage) return new DurableClaimStore({ deps });
  return defaultClaimStore;
}

function acquireClaim(ticketId, currentStatus, options = {}) {
  const store = getActiveClaimStore(options.deps || {});
  return store.acquireClaim(ticketId, currentStatus, options);
}

function ackClaim(ticketId, attemptId, result = {}, options = {}) {
  const store = getActiveClaimStore(options.deps || {});
  return store.ackClaim(ticketId, attemptId, result, options);
}

function completeClaim(ticketId, attemptId, result = {}, options = {}) {
  const store = getActiveClaimStore(options.deps || {});
  return store.completeClaim(ticketId, attemptId, result, options);
}

function deferClaim(ticketId, attemptId, reason = 'pending_verification', result = {}, options = {}) {
  const store = getActiveClaimStore(options.deps || {});
  return store.deferClaim(ticketId, attemptId, reason, result, options);
}

function releaseClaim(ticketId, attemptId, reason = 'error', options = {}) {
  const store = getActiveClaimStore(options.deps || {});
  return store.releaseClaim(ticketId, attemptId, reason, options);
}

function recoverOrphanedClaims(now = Date.now(), options = {}) {
  const store = getActiveClaimStore(options.deps || {});
  return store.recoverOrphanedClaims(now);
}

function getClaim(ticketId, options = {}) {
  const store = getActiveClaimStore(options.deps || {});
  return store.getClaim(ticketId);
}

// Backwards-compatibility aliases:
const activeLeases = defaultClaimStore.claims;
const LEASE_DURATION_MS = 60000;

function clearExpiredLeases(now = Date.now()) {
  return recoverOrphanedClaims(now);
}

function acquireLease(ticketId, currentStatus, durationMs = LEASE_DURATION_MS, now = Date.now()) {
  const res = acquireClaim(ticketId, currentStatus, { durationMs, now });
  return res.acquired ? res.attemptId : null;
}

function releaseLease(ticketId) {
  const claim = getClaim(ticketId);
  if (claim) {
    releaseClaim(ticketId, claim.attemptId, 'released');
  }
}

async function runWatchdogCycle(options = {}) {
  // Ordem 050: Verificação de kill-switch antes de iniciar o ciclo
  const pauseCheck = isWorkerPaused(options.deps, options);
  if (pauseCheck.paused) {
    console.log(`[WATCHDOG] Ciclo pausado por kill-switch (${pauseCheck.reason}). Nenhuma tarefa iniciada.`);
    return { success: true, processedCount: 0, reason: 'worker_paused', paused: true };
  }

  // 1. Recuperação proativa de jobs abandonados / órfãos após restart ou crash
  recoverOrphanedClaims(Date.now(), { deps: options.deps });

  const tickets = await fetchTickets(options.deps, options);
  if (!tickets || !Array.isArray(tickets)) {
    return { success: false, processedCount: 0, reason: 'fetch_failed' };
  }

  const pendingProduction = tickets.filter((t) => t.status === 'in_production' && t.progressPercentage !== 100);
  let processedCount = 0;

  for (const t of pendingProduction) {
    const claim = acquireClaim(t.id, t.status, { durationMs: LEASE_DURATION_MS, deps: options.deps });
    if (!claim.acquired) {
      console.log(`[WATCHDOG DEDUPLICATION] Chamado [${t.code}] retenção ativa (${claim.reason}). Ignorando disparo duplicado.`);
      continue;
    }

    const attemptId = claim.attemptId;
    try {
      console.log(`[WATCHDOG LEASE] Adquirido lease [${attemptId}] para o chamado [${t.code}].`);
      const procResult = await processTicket(t, { ...options, attemptId, fencingToken: claim.fencingToken }, options.deps);

      // Ordem 039: Distinguir terminantemente pending_verification, completed, acknowledged e failed
      if (procResult.status === 'pending_verification' || !options.allowAutonomousDeploy) {
        console.log(`[WATCHDOG DEFERRED] Chamado [${t.code}] retido para homologação de governança (pending_verification).`);
        deferClaim(t.id, attemptId, 'pending_verification', procResult, { deps: options.deps });
        processedCount++;
      } else if (procResult.status === 'resolved' || procResult.status === 'completed' || procResult.progressPercentage === 100) {
        console.log(`[WATCHDOG COMPLETED] Chamado [${t.code}] concluído com verificação comprovada.`);
        completeClaim(t.id, attemptId, procResult, { deps: options.deps });
        processedCount++;
      } else if (procResult.success === false || procResult.error) {
        console.warn(`[WATCHDOG FAILED] Chamado [${t.code}] falhou no processamento: ${procResult.error}`);
        releaseClaim(t.id, attemptId, procResult.error, { deps: options.deps });
      } else {
        // Intermediário verificado (ex: 25% aguardando código)
        ackClaim(t.id, attemptId, procResult, { deps: options.deps });
        processedCount++;
      }
    } catch (err) {
      console.error(`[WATCHDOG] Falha ao processar chamado [${t.code}] (attempt: ${attemptId}):`, err.message);
      releaseClaim(t.id, attemptId, err.message, { deps: options.deps });
    }
  }

  return { success: true, processedCount, totalPending: pendingProduction.length };
}

async function runWatchdog() {
  console.log(`[WATCHDOG ${new Date().toLocaleTimeString('pt-BR')}] Verificando banco de dados no GitHub Cloud...`);
  return await runWatchdogCycle({ allowAutonomousDeploy: false });
}

async function runContinuousWorker(options = {}) {
  const envInterval = parseInt(process.env.WATCHER_POLL_INTERVAL_MS, 10);
  const pollIntervalMs = options.pollIntervalMs || (!isNaN(envInterval) && envInterval > 0 ? envInterval : 15000);
  let isRunning = true;

  console.log("=======================================================");
  console.log("    HelpUS Unified Ticket Worker (Node.js Service)     ");
  console.log("=======================================================");
  console.log("[WORKER] Iniciado com sucesso. Polling configurado para " + (pollIntervalMs / 1000) + "s.");
  console.log("[WORKER] Identidade: service_worker (Privilégios Mínimos / Zero Telemetria Falsa)");

  const tokenMeta = inspectTokenMetadata(resolveServiceWorkerToken(options.deps, { isContinuous: true }));
  if (!tokenMeta.configured) {
    console.warn("[WORKER AUTH WARN] Nenhuma credencial de serviço configurada (SERVICE_WORKER_GITHUB_TOKEN). Worker iniciará em modo FAIL-CLOSED aguardando credencial.");
  } else {
    console.log("[WORKER AUTH] Credencial de serviço detectada: " + tokenMeta.kind + " (tamanho: " + tokenMeta.length + ").");
  }

  const cleanup = () => {
    console.log("\n[WORKER] Sinal de encerramento recebido. Finalizando com segurança...");
    isRunning = false;
    if (!options.noExit) process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  while (isRunning) {
    const cycleStart = Date.now();
    try {
      const pauseCheck = isWorkerPaused(options.deps, options);
      if (pauseCheck.paused) {
        console.warn(`[WORKER] Worker em pausa por kill-switch (${pauseCheck.reason}). Nenhuma requisição externa permitida. Aguardando...`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, 10000)));
        continue;
      }

      if (isRateLimitBackoffActive(cycleStart)) {
        const waitMs = rateLimitState.backoffUntilMs - cycleStart;
        console.warn("[WORKER] Ciclo pausado por rate limit backoff. Aguardando " + Math.round(waitMs / 1000) + "s...");
        await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 60000)));
        continue;
      }

      await runWatchdogCycle({ ...options, isContinuous: true, allowAutonomousDeploy: false });
    } catch (err) {
      console.error("[WORKER ERROR Ciclo]:", err.message);
    }

    const elapsed = Date.now() - cycleStart;
    const sleepMs = Math.max(pollIntervalMs - elapsed, 2000);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
}


/**
 * Ordem 048: Mecanismo de teste único de conexão autenticada SOMENTE-LEITURA.
 * Não inicia polling contínuo, não invoca saveTickets, não modifica dados locais nem remotos.
 * Retorna diagnóstico estruturado sem expor segredos.
 */
async function verifyServiceConnection(deps = {}, options = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const now = typeof deps.now === 'function' ? deps.now() : (deps.now || Date.now());

  // Ordem 050: Verificação prévia de Kill-Switch
  const pauseCheck = isWorkerPaused(deps, options);
  if (pauseCheck.paused) {
    return {
      ok: false,
      authenticated: false,
      status: 503,
      reason: 'worker_paused',
      message: 'Teste de conexão bloqueado: kill-switch ativo (.worker_paused).',
      tokenMetadata: inspectTokenMetadata(null),
      isReadOnlyVerified: true,
      dataMutated: false,
    };
  }

  const token = resolveServiceWorkerToken(deps, options);
  if (!token) {
    return {
      ok: false,
      authenticated: false,
      status: 401,
      reason: 'missing_service_worker_token',
      message: 'Nenhuma credencial SERVICE_WORKER_GITHUB_TOKEN configurada no ambiente.',
      tokenMetadata: inspectTokenMetadata(null),
      isReadOnlyVerified: true,
      dataMutated: false,
    };
  }

  const tokenMeta = inspectTokenMetadata(token);

  // Ordem 050: Sonda de teste de conexão é classificada como operação 'manual'
  const reservation = reserveExternalRequest('manual', deps, options);
  if (!reservation.allowed) {
    return {
      ok: false,
      authenticated: false,
      status: 429,
      reason: reservation.reason,
      message: `Teste de conexão bloqueado por governança de orçamento (${reservation.reason}).`,
      tokenMetadata: tokenMeta,
      rateLimit: null,
      detectedScopes: [],
      targetRepo: DB_REPO,
      targetPath: DB_PATH,
      isReadOnlyVerified: true,
      dataMutated: false,
    };
  }

  try {
    const headers = await getGitHubHeaders(deps, options);
    const res = await fetchFn(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}?t=${now}`, {
      headers,
      cache: 'no-store',
    });

    if (res) {
      updateRateLimitFromResponse(res, now);
    }

    const state = getRateLimitState();

    if (res && res.status === 404) {
      return {
        ok: true,
        authenticated: true,
        status: 404,
        reason: 'target_path_not_found',
        message: `Repositório ${DB_REPO} acessível com autenticação válida, mas o arquivo ${DB_PATH} ainda não foi criado.`,
        tokenMetadata: tokenMeta,
        rateLimit: { limit: state.limit, remaining: state.remaining, resetEpochSec: state.resetEpochSec },
        detectedScopes: state.detectedScopes,
        targetRepo: DB_REPO,
        targetPath: DB_PATH,
        isReadOnlyVerified: true,
        dataMutated: false,
      };
    }

    if (res && (res.status === 403 || res.status === 429)) {
      return {
        ok: false,
        authenticated: false,
        status: res.status,
        reason: res.status === 429 ? 'rate_limit_exceeded' : 'forbidden_or_rate_limited',
        message: `GitHub API respondeu com HTTP ${res.status}. Verifique permissões ou limite de taxa.`,
        tokenMetadata: tokenMeta,
        rateLimit: { limit: state.limit, remaining: state.remaining, resetEpochSec: state.resetEpochSec },
        detectedScopes: state.detectedScopes,
        targetRepo: DB_REPO,
        targetPath: DB_PATH,
        isReadOnlyVerified: true,
        dataMutated: false,
      };
    }

    if (res && res.ok) {
      const parsedHttp = await safeParseHttpResponse(res, 'GitHub Contents API Connection Probe');
      let remoteSha = null;
      let ticketCount = 0;

      if (parsedHttp.ok && parsedHttp.data) {
        remoteSha = parsedHttp.data.sha || null;
        if (typeof parsedHttp.data.content === 'string') {
          try {
            const decoded = Buffer.from(parsedHttp.data.content, 'base64').toString('utf-8');
            const arr = JSON.parse(decoded);
            if (Array.isArray(arr)) ticketCount = arr.length;
          } catch {}
        }
      }

      return {
        ok: true,
        authenticated: true,
        status: res.status,
        reason: 'connection_verified',
        message: `Conexão autenticada verificada com sucesso em ${DB_REPO}:${DB_PATH}.`,
        tokenMetadata: tokenMeta,
        rateLimit: { limit: state.limit, remaining: state.remaining, resetEpochSec: state.resetEpochSec },
        detectedScopes: state.detectedScopes,
        remoteSha,
        ticketCount,
        targetRepo: DB_REPO,
        targetPath: DB_PATH,
        isReadOnlyVerified: true,
        dataMutated: false,
      };
    }

    const status = res ? res.status : 0;
    return {
      ok: false,
      authenticated: false,
      status,
      reason: 'api_error',
      message: `GitHub API retornou status HTTP inesperado: ${status}`,
      tokenMetadata: tokenMeta,
      rateLimit: { limit: state.limit, remaining: state.remaining, resetEpochSec: state.resetEpochSec },
      detectedScopes: state.detectedScopes,
      targetRepo: DB_REPO,
      targetPath: DB_PATH,
      isReadOnlyVerified: true,
      dataMutated: false,
    };
  } catch (err) {
    return {
      ok: false,
      authenticated: false,
      status: 0,
      reason: 'network_exception',
      message: `Exceção de rede ao testar conexão: ${err.message}`,
      tokenMetadata: tokenMeta,
      targetRepo: DB_REPO,
      targetPath: DB_PATH,
      isReadOnlyVerified: true,
      dataMutated: false,
    };
  }
}

module.exports = {
  TENANTS,
  reconcileTicketLifecycle,
  processTicket,
  fetchTickets,
  saveTickets,
  verifyCommit,
  verifyDeployment,
  mergeTicketsGranular,
  runWatchdog,
  runWatchdogCycle,
  runContinuousWorker,
  signTicketEvent,
  verifyTicketEventIntegrity,
  getServiceWorkerToken,
  acquireLease,
  releaseLease,
  clearExpiredLeases,
  activeLeases,
  DurableClaimStore,
  acquireClaim,
  ackClaim,
  completeClaim,
  deferClaim,
  releaseClaim,
  recoverOrphanedClaims,
  getClaim,
  safeParseHttpResponse,
  safeSanitizeUrl,
  resolveServiceWorkerToken,
  inspectTokenMetadata,
  getRateLimitState,
  resetRateLimitState,
  isRateLimitBackoffActive,
  updateRateLimitFromResponse,
  verifyServiceConnection,
  isWorkerPaused,
  setWorkerPaused,
  resolvePauseFilePath,
  resolveBudgetFilePath,
  readDailyBudget,
  atomicSaveDailyBudget,
  reserveExternalRequest,
  getDailyBudgetStatus,
  resetDailyBudget,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const isPause = args.includes('--pause') || args.includes('-p');
  const isResume = args.includes('--resume') || args.includes('-r');
  const isStatus = args.includes('--status') || args.includes('-s');
  const isResetBudget = args.includes('--reset-budget');

  if (isPause) {
    const res = setWorkerPaused(true, 'Kill-switch ativado manualmente via linha de comando');
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  } else if (isResume) {
    const res = setWorkerPaused(false);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  } else if (isStatus) {
    const status = getDailyBudgetStatus();
    console.log('=======================================================');
    console.log('  HelpUS Watcher — Status de Governanca Local-First   ');
    console.log('=======================================================');
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  } else if (isResetBudget) {
    const res = resetDailyBudget();
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  } else if (args.includes('--bridge-status') || args.some(a => a.startsWith('--check-bridge-command='))) {
    // Ordem 057: ate duas consultas HTTP GET restritas ao loopback, sem despacho.
    const match=args.find(a=>a.startsWith('--check-bridge-command='));
    const commandId=match?match.slice('--check-bridge-command='.length):undefined;
    const {probeLocalBridgeCommand}=require('./bridge_ack_probe.js');
    probeLocalBridgeCommand(commandId).then(report=>{
      console.log(JSON.stringify(report,null,2));
      process.exit(report.ok?0:1);
    }).catch(error=>{
      console.error('[BRIDGE PROBE] Falha local:',error.message);
      process.exit(1);
    });
  } else if (args.some(a => a.startsWith('--dispatch-approved-sbx='))) {
    // Ordem 056: only a signed, remotely persisted SBX Master approval may be queued.
    const id = args.find(a => a.startsWith('--dispatch-approved-sbx=')).slice('--dispatch-approved-sbx='.length);
    const { dispatchSandboxApprovedOnDemand } = require('./approval_outbox.js');
    const { dispatchSandboxTicket } = require('./sandbox_dispatch.js');
    const paused = isWorkerPaused().paused;
    const confirmed = args.includes('--send-local');
    dispatchSandboxApprovedOnDemand(id, {
      paused, confirmed, allowedTenantIds: ['sandbox'],
      fetchTickets: () => fetchTickets({}, {isManual:true}),
      verifyEvent: verifyTicketEventIntegrity,
      dispatch: dispatchSandboxTicket,
    }).then(result => {
      console.log(JSON.stringify(result,null,2));
      process.exit(result.ok?0:1);
    }).catch(err=>{console.error('[APPROVAL OUTBOX] Fail closed:',err.message);process.exit(1)});
  } else if (args.some(a => a.startsWith('--dispatch-ticket='))) {
    // Ordem 053: SBX local-only; dry-run by default; zero GitHub requests.
    const ticketId = args.find(a => a.startsWith('--dispatch-ticket=')).split('=')[1];
    const { dispatchSandboxTicket } = require('./sandbox_dispatch.js');
    const pause = isWorkerPaused();
    dispatchSandboxTicket(ticketId, {
      paused: pause.paused,
      // Historical 053 CLI is now dry-run only. Real local sends require signed outbox verification.
      confirmed: false,
    }).then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    }).catch(error => {
      console.error('[SANDBOX DISPATCH] Operacao abortada:', error.message);
      process.exit(1);
    });
  } else {
    const isTestConn = args.includes('--test-connection') || args.includes('-t') || process.env.WORKER_MODE === 'test_connection';
    if (isTestConn) {
      verifyServiceConnection()
        .then((report) => {
          console.log('=======================================================');
          console.log('  HelpUS Watcher — Teste de Conexao Autenticada (R/O)  ');
          console.log('=======================================================');
          console.log(JSON.stringify(report, null, 2));
          process.exit(report.ok ? 0 : 1);
        })
        .catch((err) => {
          console.error('[CONNECTION TEST FATAL]:', err.message);
          process.exit(1);
        });
    } else {
      const isContinuous = args.includes('--mode=continuous') || args.includes('-c') || process.env.WORKER_MODE === 'continuous';
      if (isContinuous) {
        runContinuousWorker().catch((err) => console.error('[UNIFIED WORKER FATAL]:', err));
      } else {
        runWatchdog().catch((err) => console.error('[WATCHDOG ERROR]:', err));
      }
    }
  }
}
