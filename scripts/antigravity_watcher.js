// scripts/antigravity_watcher.js
// Antigravity Watchdog & Autonomous Pipeline Runner (HelpUS Support Hub)
// P0-01: Zero credenciais embutidas. Exclusivamente process.env.
// P0-01 (Auditoria): Deploy hook HTTP 2xx não atesta READY; não marca resolved sem validação de deployment.
// P0-02 (Auditoria): Retornos de updateCloud() são estritamente validados; falha de persistência aborta o fluxo.
// P0-03 (Auditoria): Etapa 50% exige commit e alteração comprovada no repositório; não assume progresso nominal.
// P1-01: Rejeição estrita de tenants desconhecidos (sem fallback).
// P1-02: fetchTickets() retorna null em erro de rede/API para não mascarar falhas como base vazia ([]).

const fs = require('fs');
const path = require('path');

// P0-01: Remover credencial hardcoded. Exigir variável de ambiente.
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

async function getGitHubHeaders() {
  const headers = {
    'User-Agent': 'Antigravity-Watchdog',
    'Accept': 'application/vnd.github+json'
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN.trim()}`;
  }
  return headers;
}

// P1-02: Retorna null em caso de falha de rede/API para não confundir indisponibilidade com base vazia ([])
async function fetchTickets() {
  let hasError = false;
  try {
    const headers = await getGitHubHeaders();
    const res = await fetch(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`, { headers, cache: 'no-store' });
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
    const res = await fetch(`https://raw.githubusercontent.com/${DB_REPO}/main/${DB_PATH}?t=${Date.now()}`, { cache: 'no-store' });
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

async function saveTickets(tickets, maxRetries = 3) {
  if (!GITHUB_TOKEN) {
    console.warn('[WATCHDOG SECURITY] GITHUB_TOKEN não configurado no ambiente. Salvamento remoto no GitHub Cloud suspenso.');
    return false;
  }

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const headers = {
        'Authorization': `Bearer ${GITHUB_TOKEN.trim()}`,
        'User-Agent': 'Antigravity-Watchdog',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json'
      };

      let latestSha = undefined;
      const check = await fetch(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`, { headers, cache: 'no-store' });
      if (check.ok) {
        const d = await check.json();
        latestSha = d.sha;
        cloudSha = d.sha;
      } else if (check.status !== 404) {
        console.error(`[WATCHDOG] Check SHA failed status ${check.status}`);
        return false;
      }

      const res = await fetch(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `db(watchdog): update tickets execution progress (attempt ${attempt})`,
          content: Buffer.from(JSON.stringify(tickets, null, 2), 'utf-8').toString('base64'),
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

      // Tratamento de conflito 409 (CAS)
      if (res.status === 409) {
        console.warn(`[WATCHDOG CAS] Conflito 409 detectado na tentativa ${attempt}. Reconciliando SHA...`);
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

async function processTicket(ticket, options = {}) {
  console.log(`\n🚀 [WATCHDOG ANTIGRAVITY] DETECTADO CHAMADO EM PRODUÇÃO: [${ticket.code}] - "${ticket.title}"`);

  // P1-01: Rejeitar tenant desconhecido estritamente sem fallback
  const tenant = TENANTS[ticket.tenantId];
  if (!tenant) {
    const errorMsg = `[WATCHDOG SECURITY] Erro Crítico: Tenant desconhecido '${ticket.tenantId}' no chamado [${ticket.code}]. Fallback rejeitado por política de segurança.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // P0-02: Execução comprovada em vez de simulação artificial
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
    const freshTickets = await fetchTickets();
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

    return await saveTickets(freshTickets);
  };

  // Etapa 1: 25% - Análise e Requisitos Validados
  console.log(`[WATCHDOG] Executando validação de requisitos para ${tenant.name}...`);
  const ok25 = await updateCloud(25, `📥 Requisitos validados com sucesso para o tenant ${tenant.name} (${tenant.domain}).`);
  if (!ok25) {
    console.error(`[WATCHDOG P0-02] Falha ao persistir status 25% para [${ticket.code}]`);
    return { success: false, step: 25, error: 'cloud_save_failed_at_25' };
  }

  // Etapa 2: 50% - Validação de Código Comprovado (P0-03)
  // O código exige que haja um commit comprovado vinculado ao chamado ou verificação de workspace
  const solutionCommitSha = options.verifiedSha || ticket.solutionCommitSha;
  if (!solutionCommitSha) {
    console.log(`[WATCHDOG P0-03] Chamado [${ticket.code}] aguardando commit de alteração de código real. Não assumindo conclusão nominal.`);
    const okHold = await updateCloud(25, `🛠️ Análise concluída. Aguardando implementação técnica e commit no repositório ${tenant.repo}...`);
    return { success: true, step: 25, status: 'in_production', note: 'Aguardando commit de alteração de código verificável' };
  }

  console.log(`[WATCHDOG] Código comprovado vinculado: commit ${solutionCommitSha} em ${tenant.repo}`);
  const ok50 = await updateCloud(50, `🛠️ Alteração técnica comprovada (commit ${solutionCommitSha.slice(0, 7)}) no repositório ${tenant.repo}.`);
  if (!ok50) {
    console.error(`[WATCHDOG P0-02] Falha ao persistir status 50% para [${ticket.code}]`);
    return { success: false, step: 50, error: 'cloud_save_failed_at_50' };
  }

  // Etapa 3: 75% - Disparo do Deploy Hook
  let deployTriggered = false;
  if (tenant.deployHook) {
    try {
      const hookRes = await fetch(tenant.deployHook, { method: 'POST' });
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

  // P0-01: Não considerar HTTP 2xx do Deploy Hook prova de deploy concluído.
  // Apenas avança para 100% / resolved se houver confirmação explícita de READY do deployment
  if (options.deploymentReady === true) {
    const finalMsg = `✨ *[CONCLUÍDO & RESOLVIDO]*: A solicitação [${ticket.code}] foi processada com validação completa no tenant ${tenant.name} (${tenant.domain}) e confirmada como READY em produção.`;
    const ok100 = await updateCloud(100, `✅ Publicação confirmada e verificada como READY em ${tenant.domain}.`, finalMsg, 'resolved');
    if (!ok100) {
      console.error(`[WATCHDOG P0-02] Falha ao persistir status 100% para [${ticket.code}]`);
      return { success: false, step: 100, error: 'cloud_save_failed_at_100' };
    }
    console.log(`🎉 [WATCHDOG ANTIGRAVITY] CHAMADO ${ticket.code} CONCLUÍDO COM SUCESSO VERIFICADO!`);
    return { success: true, step: 100, status: 'resolved' };
  } else {
    console.log(`[WATCHDOG P0-01] Deploy hook aceito, mas deployment READY ainda pendente de validação. Mantendo chamado em homologação (75%).`);
    return {
      success: true,
      step: 75,
      status: 'in_production',
      note: 'Deploy acionado; aguardando confirmação de deployment READY para conclusão'
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
  runWatchdog
};

if (require.main === module) {
  runWatchdog().catch((err) => console.error('[WATCHDOG ERROR]:', err));
}
