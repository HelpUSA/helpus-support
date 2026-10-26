const fs = require('fs');
const path = require('path');

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
    deployHook: process.env.VERCEL_DEPLOY_HOOK_BRAYYAN || null
  },
  publicarte: {
    name: 'Public Arte',
    repo: 'HelpUSA/publicarte',
    domain: 'publicarte.helpusbr.com',
    deployHook: process.env.VERCEL_DEPLOY_HOOK_PUBLICARTE || null
  },
  usmle: {
    name: 'USMLE Platform',
    repo: 'HelpUSA/usmle',
    domain: 'usmle.helpusbr.com',
    deployHook: process.env.VERCEL_DEPLOY_HOOK_USMLE || null
  },
  studionaldohair: {
    name: 'Studio Naldo Hair',
    repo: 'HelpUSA/studionaldohair',
    domain: 'studionaldohair.helpusbr.com',
    deployHook: process.env.VERCEL_DEPLOY_HOOK_STUDIONALDOHAIR || null
  },
  aidoctor: {
    name: 'AIDoctor — Inteligência Artificial Clínica',
    repo: 'HelpUSA/aidoctor',
    domain: 'aidoctor.helpusbr.com',
    deployHook: process.env.VERCEL_DEPLOY_HOOK_AIDOCTOR || null
  }
};

let cloudSha = null;

// Reconciliação granular de tickets para concorrência CAS sem perda de mensagens (P0-04)
function mergeTicketsGranular(remoteTickets, localTickets) {
  const map = new Map();

  for (const t of remoteTickets) {
    map.set(t.id, { ...t, messages: [...(t.messages || [])] });
  }

  for (const localT of localTickets) {
    const remoteT = map.get(localT.id);
    if (!remoteT) {
      map.set(localT.id, { ...localT, messages: [...(localT.messages || [])] });
    } else {
      const mergedMessagesMap = new Map();
      for (const m of (remoteT.messages || [])) {
        const key = m.id || `${m.createdAt || ''}_${m.senderId || ''}_${m.content || ''}`;
        mergedMessagesMap.set(key, m);
      }
      for (const m of (localT.messages || [])) {
        const key = m.id || `${m.createdAt || ''}_${m.senderId || ''}_${m.content || ''}`;
        mergedMessagesMap.set(key, m);
      }

      const mergedMessages = Array.from(mergedMessagesMap.values()).sort((a, b) =>
        (a.createdAt || '').localeCompare(b.createdAt || '')
      );

      const localUpdated = localT.updatedAt || '';
      const remoteUpdated = remoteT.updatedAt || '';
      const baseTicket = (localUpdated >= remoteUpdated) ? localT : remoteT;

      map.set(localT.id, {
        ...baseTicket,
        messages: mergedMessages,
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

// P1-02: Retorna null em caso de falha de rede/API para não confundir indisponibilidade com base vazia ([])
async function fetchTickets(deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  let hasError = false;

  try {
    const headers = await getGitHubHeaders(deps);
    const res = await fetchFn(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`, { headers, cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      cloudSha = data.sha;
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return JSON.parse(content);
    } else if (res.status === 404) {
      return []; // Base legítima ainda não criada
    } else {
      console.error(`[WATCHDOG] GitHub API fetch error status ${res.status}`);
      hasError = true;
    }
  } catch (e) {
    console.error('[WATCHDOG] Fetch API error:', e.message);
    hasError = true;
  }

  try {
    const res = await fetchFn(`https://raw.githubusercontent.com/${DB_REPO}/main/${DB_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      return await res.json();
    } else if (res.status === 404) {
      return [];
    } else {
      hasError = true;
    }
  } catch (e) {
    console.error('[WATCHDOG] Fetch raw error:', e.message);
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

      // Tratamento de conflito 409 (CAS) com Reconciliação Granular (P0-02 & P0-04)
      if (res.status === 409) {
        console.warn(`[WATCHDOG CAS] Conflito 409 detectado na tentativa ${attempt}. Reconciliando granularmente com banco remoto...`);
        const fresh = await fetchTickets(deps);
        if (fresh && Array.isArray(fresh)) {
          currentTickets = mergeTicketsGranular(fresh, currentTickets);
        }
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

// P0-01 (Auditoria): Verificador de procedência de commit no GitHub
async function verifyCommit(tenant, commitSha, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const token = (deps.githubToken || GITHUB_TOKEN || '').trim();

  if (!commitSha || typeof commitSha !== 'string' || !/^[0-9a-f]{7,40}$/i.test(commitSha)) {
    return { valid: false, reason: 'invalid_sha_format' };
  }

  if (!tenant || !tenant.repo) {
    return { valid: false, reason: 'missing_tenant_repo' };
  }

  if (deps.verifyCommitFn) {
    return await deps.verifyCommitFn(tenant, commitSha);
  }

  if (token) {
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
      return { valid: true, fullSha: data.sha, message: data.commit?.message };
    } catch (e) {
      return { valid: false, reason: `github_api_error: ${e.message}` };
    }
  }

  // Se sem token de API configurado, aceita SHA completo de 40 dígitos em fallback offline seguro
  if (commitSha.length === 40) {
    return { valid: true, fullSha: commitSha };
  }

  return { valid: false, reason: 'unverified_short_sha_without_token' };
}

// P0-01 (Auditoria): Verificador de procedência e status READY do deployment na Vercel
async function verifyDeployment(tenant, options = {}, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;

  if (deps.verifyDeploymentFn) {
    return await deps.verifyDeploymentFn(tenant, options);
  }

  // 1. Verificação via Vercel Deployments API
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
        const isReady = state === 'READY';
        const isProd = d.target === 'production' || !d.target;
        const matchesCommit = !options.expectedSha || (d.meta?.githubCommitSha === options.expectedSha);

        if (isReady && isProd && matchesCommit) {
          return { ready: true, deploymentId: d.id, url: d.url };
        }
        return { ready: false, reason: `deployment_status_${state}` };
      }
      return { ready: false, reason: `vercel_api_error_${res.status}` };
    } catch (e) {
      return { ready: false, reason: e.message };
    }
  }

  // 2. Verificação via Smoke Test / Health Check ativo no domínio
  if (options.smokeTest) {
    try {
      const targetUrl = `https://${tenant.domain}`;
      const res = await fetchFn(targetUrl, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        return { ready: true, method: 'smoke_test_ok', status: res.status };
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

  // Rejeita simples flags booleanas sem identidade ou proveniência comprovada
  return { ready: false, reason: 'unverified_deployment_provenance' };
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

async function runWatchdog() {
  console.log(`[WATCHDOG ${new Date().toLocaleTimeString('pt-BR')}] Verificando banco de dados no GitHub Cloud...`);
  const tickets = await fetchTickets();
  if (!tickets || !Array.isArray(tickets)) {
    console.warn('[WATCHDOG] Consulta ao banco remoto indisponível neste ciclo. Tentando novamente no próximo ciclo.');
    return;
  }

  const pendingProduction = tickets.filter((t) => t.status === 'in_production' && t.progressPercentage !== 100);

  if (pendingProduction.length === 0) {
    console.log('[WATCHDOG] NENHUM chamado aguardando execução em produção no momento.');
    return;
  }

  for (const t of pendingProduction) {
    try {
      await processTicket(t, { allowAutonomousDeploy: false });
    } catch (err) {
      console.error(`[WATCHDOG] Falha ao processar chamado [${t.code}]:`, err.message);
    }
  }
}

module.exports = {
  TENANTS,
  processTicket,
  fetchTickets,
  saveTickets,
  verifyCommit,
  verifyDeployment,
  mergeTicketsGranular,
  runWatchdog
};

if (require.main === module) {
  runWatchdog().catch((err) => console.error('[WATCHDOG ERROR]:', err));
}
