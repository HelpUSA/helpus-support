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

// P0-01: Zero credenciais hardcoded. Exclusivamente process.env.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
const DB_REPO = process.env.HELPUS_DB_REPO || 'HelpUSA/publicarte';
const DB_PATH = process.env.HELPUS_DB_PATH || 'data/helpus_tickets.json';

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

async function getGitHubHeaders(deps = {}) {
  const token = (deps.githubToken || GITHUB_TOKEN || '').trim();
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
async function fetchTickets(deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  let hasError = false;

  // 1. Consulta Contents API no GitHub com parsing seguro e logs de auditoria
  try {
    const headers = await getGitHubHeaders(deps);
    const res = await fetchFn(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`, { headers, cache: 'no-store' });
    
    if (res && res.status === 404) {
      return []; // Base legítima ainda não criada
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

  // 2. Fallback resiliente para raw.githubusercontent.com
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

  if (hasError) {
    console.warn('[WATCHDOG ALERT] Falha ao consultar banco remoto. Retornando null para preservar dados locais e evitar sobrescrita.');
    return null;
  }
  return [];
}

// P0-02 & P0-04: Reconciliação em nível de operação com CAS e retries sem perda de dados
async function saveTickets(tickets, maxRetries = 3, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const token = (deps.githubToken || GITHUB_TOKEN || '').trim();

  if (!token) {
    console.warn('[WATCHDOG SECURITY] GITHUB_TOKEN não configurado no ambiente. Salvamento remoto no GitHub Cloud suspenso.');
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
async function verifyCommit(tenant, commitSha, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const token = (deps.githubToken || GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();

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
  // 1. Recuperação proativa de jobs abandonados / órfãos após restart ou crash
  recoverOrphanedClaims(Date.now(), { deps: options.deps });

  const tickets = await fetchTickets(options.deps);
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
  const pollIntervalMs = options.pollIntervalMs || 5000;
  let isRunning = true;

  console.log('=======================================================');
  console.log('    HelpUS Unified Ticket Worker (Node.js Service)     ');
  console.log('=======================================================');
  console.log(`[WORKER] Iniciado com sucesso. Polling a cada ${pollIntervalMs / 1000}s.`);
  console.log('[WORKER] Identidade: service_worker (Privilégios Mínimos / Zero Telemetria Falsa)');

  const cleanup = () => {
    console.log('\n[WORKER] Sinal de encerramento recebido. Finalizando com segurança...');
    isRunning = false;
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  while (isRunning) {
    try {
      await runWatchdogCycle({ ...options, allowAutonomousDeploy: false });
    } catch (err) {
      console.error('[WORKER ERROR Ciclo]:', err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
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
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const isContinuous = args.includes('--mode=continuous') || args.includes('-c') || process.env.WORKER_MODE === 'continuous';
  if (isContinuous) {
    runContinuousWorker().catch((err) => console.error('[UNIFIED WORKER FATAL]:', err));
  } else {
    runWatchdog().catch((err) => console.error('[WATCHDOG ERROR]:', err));
  }
}
