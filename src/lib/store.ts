import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { Ticket, Tenant, Message, Attachment } from '@/types/ticket';
import { INITIAL_TENANTS } from '@/lib/tenants';
import { notificationService } from '@/lib/notifications';
import { emailService } from '@/lib/emailService';
import { getAutoResolutionDetails } from '@/lib/aiResolver';
import { aiAutoCodingWorker } from '@/lib/aiWorker';
export { INITIAL_TENANTS };

export const INITIAL_TICKETS: Ticket[] = [
  {
    id: "tck-1792960000000",
    tenantId: "aidoctor",
    tenantName: "AIDoctor",
    code: "AID-101",
    title: "Retire o texto circulado na imagem em anexo",
    description: "Solicitação para remoção dos textos circulares com badges de CRM fictícios (CRM/SP, CRM/RJ, CRM/PR) na seção de depoimentos da aplicação AIDoctor (aidoctor.helpusbr.com), adequando a página às normas de publicidade médica do CFM.",
    category: "feature",
    priority: "high",
    status: "pending_approval",
    assignedTo: "HelpUS Master SuperAdmin",
    createdByEmail: "helpus.ecommerce@gmail.com",
    createdByName: "SuperAdmin HelpUS",
    contextData: {
      url: "https://aidoctor.helpusbr.com",
      userEmail: "helpus.ecommerce@gmail.com",
      userName: "SuperAdmin HelpUS",
      os: "Mobile Android / Chrome",
      screen: "472x1024"
    },
    attachments: [
      {
        id: "att-aid-01",
        name: "screenshot_crm_circulado.png",
        url: "/uploads/screenshot_crm_circulado.png",
        type: "image/png",
        size: 142000
      }
    ],
    messages: [
      {
        id: "msg-aid-001",
        ticketId: "tck-1792960000000",
        senderId: "helpus.ecommerce@gmail.com",
        senderName: "SuperAdmin HelpUS",
        senderRole: "client",
        isInternalNote: false,
        content: "Retire o texto circulado na imagem em anexo (CRM/SP no card de depoimentos de médicos).",
        createdAt: "2026-10-25T17:30:00.000Z"
      },
      {
        id: "msg-aid-002",
        ticketId: "tck-1792960000000",
        senderId: "helpus-master",
        senderName: "HelpUS Master SuperAdmin",
        senderRole: "agent",
        isInternalNote: false,
        content: "✅ Aprovação Concedida pelo Administrador HelpUS (HelpUS Master SuperAdmin). Autorizando envio para produção...",
        createdAt: "2026-10-25T17:34:00.000Z"
      },
      {
        id: "msg-aid-003",
        ticketId: "tck-1792960000000",
        senderId: "ci.cd@helpusbr.com",
        senderName: "Pipeline de Produção Vercel",
        senderRole: "agent",
        isInternalNote: false,
        content: "⚡ *[ENTROU EM PRODUÇÃO]*: O robô autônomo iniciou o processamento do código e o envio para a nuvem Vercel (AIDoctor). Compilação e deploy concluídos.",
        createdAt: "2026-10-25T17:34:05.000Z"
      },
      {
        id: "msg-aid-004",
        ticketId: "tck-1792960000000",
        senderId: "helpus-master",
        senderName: "HelpUS Master SuperAdmin",
        senderRole: "agent",
        isInternalNote: false,
        content: "✨ *[CONCLUÍDO & RESOLVIDO]*: O texto circulado 'CRM/SP' e os placeholders 'CRM/RJ' e 'CRM/PR' foram completamente removidos dos cards de depoimentos da página https://aidoctor.helpusbr.com. Em seu lugar, foram inseridos ícones vetoriais neutros em SVG estilizados em dourado (#D4AF37), garantindo 100% de conformidade com a Resolução CFM nº 2.336/2023 de Publicidade Médica. Deploy realizado em produção na Vercel com sucesso.",
        createdAt: "2026-10-25T17:53:00.000Z"
      },
      {
        id: "msg-aid-005",
        ticketId: "tck-1792960000000",
        senderId: "helpus.ecommerce@gmail.com",
        senderName: "HelpUS Master SuperAdmin",
        senderRole: "client",
        isInternalNote: false,
        content: "🔄 *Chamado Reaberto pelo Cliente (HelpUS Master SuperAdmin)*\n\nMotivo da Reabertura: a mensagem ainda continua.\n\n*Aguardando Nova Aprovação Master para Envio a Produção.*",
        createdAt: "2026-10-25T19:25:00.000Z"
      }
    ],
    createdAt: "2026-10-25T17:30:00.000Z",
    updatedAt: "2026-10-25T17:53:00.000Z"
  },
  {
    id: "tck-1791240000000",
    tenantId: "usmle",
    tenantName: "USMLE Prep Suite",
    code: "USM-120",
    title: "Falha de Login Google (Invalid sessionId) e Travamento dos Baralhos de Flashcards",
    description: "A usuária Maryana Chaves reportou 3 problemas críticos através de áudios e capturas de tela no USMLE Prep Suite (usmle.helpusbr.com): 1) Falha no Login Google com erro 'sessionId: Invalid sessionId'; 2) Botão '+3 dias' dos Flashcards não avança o cartão; 3) Baralhos diferentes exibindo os mesmos cards repetidos.",
    category: "bug",
    priority: "urgent",
    status: "resolved",
    assignedTo: "HelpUS Master SuperAdmin",
    createdByEmail: "marychavesmcp@gmail.com",
    createdByName: "Maryana Chaves",
    contextData: {
      url: "https://usmle.helpusbr.com",
      userEmail: "marychavesmcp@gmail.com",
      userName: "Maryana Chaves",
      os: "iPadOS / Chrome & Safari Mobile (Thea AI Reference)",
      screen: "2048x1536 (iPad Retina)"
    },
    attachments: [
      {
        id: "att-usmle-01",
        name: "WhatsApp Image - Erro sessionId no Login Google.jpeg",
        url: "/uploads/maryana_login_error_sessionid.jpeg",
        type: "image/jpeg",
        size: 68117
      },
      {
        id: "att-usmle-02",
        name: "WhatsApp Image - Referência Thea AI Flashcards iPad.jpeg",
        url: "/uploads/maryana_ipad_thea_ai.jpeg",
        type: "image/jpeg",
        size: 109169
      }
    ],
    messages: [
      {
        id: "msg-1791240000001",
        ticketId: "tck-1791240000000",
        senderId: "marychavesmcp@gmail.com",
        senderName: "Maryana Chaves",
        senderRole: "client",
        isInternalNote: false,
        content: "Olá equipe HelpUS! Estou com problemas no login Google (Invalid sessionId), os botões dos flashcards (+3 dias) não avançam e todos os baralhos estão com as mesmas perguntas repetidas. Seguem prints do erro e do app Thea AI no meu iPad.",
        attachments: [
          {
            id: "att-usmle-01",
            name: "WhatsApp Image - Erro sessionId no Login Google.jpeg",
            url: "/uploads/maryana_login_error_sessionid.jpeg",
            type: "image/jpeg",
            size: 68117
          },
          {
            id: "att-usmle-02",
            name: "WhatsApp Image - Referência Thea AI Flashcards iPad.jpeg",
            url: "/uploads/maryana_ipad_thea_ai.jpeg",
            type: "image/jpeg",
            size: 109169
          }
        ],
        createdAt: "2026-10-11T21:46:57.000Z"
      },
      {
        id: "msg-1791240000002",
        ticketId: "tck-1791240000000",
        senderId: "helpus-master",
        senderName: "HelpUS Master SuperAdmin",
        senderRole: "agent",
        isInternalNote: false,
        content: "✅ Aprovação Concedida pelo Administrador HelpUS (HelpUS Master SuperAdmin). Autorizando envio para produção com lazy pool PostgreSQL, schemas abertos de sessionId, avanço otimista dos flashcards e 5 baralhos High-Yield.",
        createdAt: "2026-10-11T21:55:00.000Z"
      },
      {
        id: "msg-1791240000006",
        ticketId: "tck-1791240000000",
        senderId: "ia.engine@helpusbr.com",
        senderName: "IA Autônoma (HelpUS Tech)",
        senderRole: "agent",
        isInternalNote: false,
        content: "✨ *[CONCLUÍDO & RESOLVIDO]*: Chamado USM-120 homologado e implantado com sucesso na nuvel Vercel (https://usmle.helpusbr.com). Login Google regularizado, avanço instantâneo nos flashcards ativado e 5 baralhos especializados disponibilizados.",
        createdAt: "2026-10-11T22:30:00.000Z"
      }
    ],
    adminNotes: "Chamado prioritário homologado e executado em produção na Vercel.",
    progressPercentage: 100,
    progressStep: "✨ Concluído e implantado em produção na Vercel (https://usmle.helpusbr.com)",
    createdAt: "2026-10-11T21:46:57.000Z",
    updatedAt: "2026-10-11T22:30:00.000Z"
  },
  {
    id: "tck-1791048000000",
    tenantId: "neuro.eduardomagalhaes",
    tenantName: "Dr. Eduardo Magalhães Neurologista (Neuro)",
    code: "NEU-107",
    title: "Calendário e máscara de data nos campos de exame e emissão",
    description: "Nos dois Campos que são data do exame e data da emissão assinatura do laudo ficará mais prático se ao clicar abrir um pequeno calendário, e que o campo de digitação já tenha uma máscara prévia com formato de data com as barras separando o dia mês e ano",
    category: "support",
    priority: "medium",
    status: "resolved",
    assignedTo: "HelpUS Master SuperAdmin",
    createdByEmail: "eduardojcmagalhaes@gmail.com",
    createdByName: "Eduardo Magalhães (Neuro)",
    contextData: {
      url: "https://neuro.eduardomagalhaes.helpusbr.com",
      userEmail: "eduardojcmagalhaes@gmail.com",
      userName: "Eduardo Magalhães (Neuro)",
      os: "Windows 11 (Chrome 128)"
    },
    attachments: [],
    messages: [
      {
        id: "msg-1791048000000",
        ticketId: "tck-1791048000000",
        senderId: "eduardojcmagalhaes@gmail.com",
        senderName: "Eduardo Magalhães (Neuro)",
        senderRole: "client",
        isInternalNote: false,
        content: "Nos dois Campos que são data do exame e data da emissão assinatura do laudo ficará mais prático se ao clicar abrir um pequeno calendário, e que o campo de digitação já tenha uma máscara prévia com formato de data com as barras separando o dia mês e ano",
        attachments: [],
        createdAt: "2026-10-03T23:01:51.000Z"
      },
      {
        "id": "msg-res-1791048000003",
        "ticketId": "tck-1791048000000",
        "senderId": "ia.engine@helpusbr.com",
        "senderName": "IA Autônoma (HelpUS Tech)",
        "senderRole": "agent",
        "isInternalNote": false,
        "content": "✨ *[CONCLUÍDO & RESOLVIDO]*: Adicionado calendário interativo e máscara de data no formato DD/MM/AAAA para os campos 'Data do Exame' e 'Emissão / Assinatura do Laudo' na aplicação de Laudos Médicos (neuro.eduardomagalhaes).",
        "createdAt": "2026-10-04T01:15:00.000Z"
      }
    ],
    createdAt: "2026-10-03T23:01:51.000Z",
    updatedAt: "2026-10-04T06:00:00.000Z"
  },
  {
    id: "tck-1791041805230",
    tenantId: "publicarte",
    tenantName: "Public Arte",
    code: "PUB-106",
    title: "atualização de produtos e categorias",
    description: "analise esses tres pdfs com imagens de publicações da publicarte. pegue as categorias, as imagens, etc e monte a base de dados de produtos reais que a publicarte tem.",
    category: "support",
    priority: "medium",
    status: "resolved",
    createdByEmail: "helpus.ecommerce@gmail.com",
    createdByName: "HelpUS Master SuperAdmin",
    contextData: {
      url: "https://publicarte.helpusbr.com",
      userEmail: "helpus.ecommerce@gmail.com",
      userName: "HelpUS Master SuperAdmin",
      os: "Windows 11 (Chrome 128)"
    },
    attachments: [],
    messages: [
      {
        id: "msg-1791041805230",
        ticketId: "tck-1791041805230",
        senderId: "helpus.ecommerce@gmail.com",
        senderName: "HelpUS Master SuperAdmin",
        senderRole: "client",
        isInternalNote: false,
        content: "analise esses tres pdfs com imagens de publicações da publicarte. pegue as categorias, as imagens, etc e monte a base de dados de produtos reais que a publicarte tem.",
        attachments: [],
        createdAt: "2026-10-03T12:36:45.523Z"
      },
      {
        id: "msg-res-1791041805230",
        ticketId: "tck-1791041805230",
        senderId: "helpus.ecommerce@gmail.com",
        senderName: "HelpUS Master SuperAdmin",
        senderRole: "agent",
        isInternalNote: false,
        content: "✨ *[CONCLUÍDO & RESOLVIDO]*: A base de dados de produtos da Public Arte foi atualizada com sucesso a partir da análise detalhada das publicações dos 3 catálogos PDF. Foram catalogados 21 produtos reais completos organizados por categorias.",
        createdAt: "2026-10-03T17:10:00.000Z"
      }
    ],
    createdAt: "2026-10-03T12:36:45.523Z",
    updatedAt: "2026-10-03T17:10:00.000Z",
    assignedTo: "HelpUS Master SuperAdmin"
  },
  {
    id: "tck-1791038803000",
    tenantId: "neuro.eduardomagalhaes",
    tenantName: "Dr. Eduardo Magalhães Neurologista (Neuro)",
    code: "NEU-105",
    title: "Datas de exame",
    description: "Na tela de edição de laudos dos exames a data do exame está atualizando automaticamente enquanto a data da emissão assinatura do laudo permanece igual. Tem que ser o contrário",
    category: "support",
    priority: "medium",
    status: "resolved",
    createdByEmail: "eduardojcmagalhaes@gmail.com",
    createdByName: "Eduardo Magalhães (Neuro)",
    contextData: {
      url: "https://neuro.eduardomagalhaes.helpusbr.com",
      userEmail: "eduardojcmagalhaes@gmail.com",
      userName: "Eduardo Magalhães (Neuro)",
      os: "Windows 11 (Chrome 128)"
    },
    attachments: [],
    messages: [
      {
        id: "msg-1791038803000",
        ticketId: "tck-1791038803000",
        senderId: "eduardojcmagalhaes@gmail.com",
        senderName: "Eduardo Magalhães (Neuro)",
        senderRole: "client",
        isInternalNote: false,
        content: "Na tela de edição de laudos dos exames a data do exame está atualizando automaticamente enquanto a data da emissão assinatura do laudo permanece igual. Tem que ser o contrário",
        attachments: [],
        createdAt: "2026-10-03T09:06:43.000Z"
      },
      {
        id: "msg-res-1791038803000",
        ticketId: "tck-1791038803000",
        senderId: "helpus.ecommerce@gmail.com",
        senderName: "HelpUS Master SuperAdmin",
        senderRole: "agent",
        isInternalNote: false,
        content: "✨ *[CONCLUÍDO & RESOLVIDO]*: A data de Emissão/Assinatura do Laudo agora é atualizada dinamicamente para o dia de hoje (data atual), enquanto a Data do Exame permanece preservada do registro do exame.",
        createdAt: "2026-10-03T12:05:00.000Z"
      }
    ],
    createdAt: "2026-10-03T09:06:43.000Z",
    updatedAt: "2026-10-03T12:05:00.000Z",
    assignedTo: "HelpUS Master SuperAdmin"
  },
  {
    id: "tck-1790973331000",
    tenantId: "neuro.eduardomagalhaes",
    tenantName: "Dr. Eduardo Magalhães Neurologista (Neuro)",
    code: "NEU-104",
    title: "Árvore de modelos fechada por padrão",
    description: "Na tela de edição de laudos a árvore de modelos deverá ficar fechada por padrão ao carregarmos a página, de modo a podermos ver rapidamente qual ramificação da árvore precisamos",
    category: "support",
    priority: "medium",
    status: "resolved",
    createdByEmail: "eduardojcmagalhaes@gmail.com",
    createdByName: "Eduardo Magalhães (Neuro)",
    contextData: {
      url: "https://neuro.eduardomagalhaes.helpusbr.com",
      userEmail: "eduardojcmagalhaes@gmail.com",
      userName: "Eduardo Magalhães (Neuro)",
      os: "Windows 11 (Chrome 128)"
    },
    attachments: [],
    messages: [
      {
        id: "msg-1790973331000",
        ticketId: "tck-1790973331000",
        senderId: "eduardojcmagalhaes@gmail.com",
        senderName: "Eduardo Magalhães (Neuro)",
        senderRole: "client",
        isInternalNote: false,
        content: "Na tela de edição de laudos a árvore de modelos deverá ficar fechada por padrão ao carregarmos a página, de modo a podermos ver rapidamente qual ramificação da árvore precisamos",
        attachments: [],
        createdAt: "2026-10-02T17:35:31.000Z"
      },
      {
        id: "msg-res-1790973345000",
        ticketId: "tck-1790973331000",
        senderId: "helpus.ecommerce@gmail.com",
        senderName: "HelpUS Master SuperAdmin",
        senderRole: "agent",
        isInternalNote: false,
        content: "✨ *[CONCLUÍDO & RESOLVIDO]*: A árvore de modelos de laudos agora inicia 100% FECHADA/COLAPSADA por padrão ao carregar a página.",
        createdAt: "2026-10-02T17:41:00.000Z"
      }
    ],
    createdAt: "2026-10-02T17:35:31.000Z",
    updatedAt: "2026-10-02T17:41:00.000Z",
    assignedTo: "HelpUS Master SuperAdmin"
  }
];

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const DB_REPO = process.env.GITHUB_DB_REPO || 'HelpUSA/publicarte';
const DB_PATH = process.env.GITHUB_DB_PATH || 'data/helpus_tickets.json';

let cloudSha: string | null = null;

function githubApiRequest(method: string, path: string, body?: any): Promise<{ status: number; data: any; raw: string }> {
  return new Promise((resolve) => {
    const token = (GITHUB_TOKEN || '').trim();
    const payload = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          'User-Agent': 'HelpUS-Support-Hub',
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let responseText = '';
        res.on('data', (chunk) => (responseText += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(responseText);
            resolve({ status: res.statusCode || 500, data, raw: responseText });
          } catch {
            resolve({ status: res.statusCode || 500, data: null, raw: responseText });
          }
        });
      }
    );

    req.on('error', (err) => resolve({ status: 500, data: null, raw: String(err) }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchGitHubTickets(): Promise<Ticket[]> {
  const token = (GITHUB_TOKEN || '').trim();
  try {
    // 1. Obter metadata para atualizar cloudSha
    const meta = await githubApiRequest('GET', `/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`);
    if (meta.status === 200 && meta.data && meta.data.sha) {
      cloudSha = meta.data.sha;
      if (meta.data.content) {
        const content = Buffer.from(meta.data.content, 'base64').toString('utf-8');
        return JSON.parse(content);
      }
    }

    // 2. Quando o arquivo excede 1MB, o GitHub omite 'content'. Buscar via Accept: application/vnd.github.raw
    const rawApiRes = await fetch(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`, {
      headers: {
        'User-Agent': 'HelpUS-Support-Hub',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.raw',
      },
      cache: 'no-store',
    });
    if (rawApiRes.ok) {
      const tickets: Ticket[] = await rawApiRes.json();
      return tickets;
    }
  } catch (err) {
    console.error('Error fetching tickets from GitHub API:', err);
  }

  try {
    const rawRes = await fetch(`https://raw.githubusercontent.com/${DB_REPO}/main/${DB_PATH}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (rawRes.ok) {
      const tickets: Ticket[] = await rawRes.json();
      return tickets;
    }
  } catch (err) {
    console.error('Error fetching tickets from raw GitHub:', err);
  }
  return [];
}

async function saveGitHubTickets(tickets: Ticket[]): Promise<{ success: boolean; error?: string }> {
  if (!GITHUB_TOKEN || !GITHUB_TOKEN.trim()) {
    return { success: false, error: 'No GITHUB_TOKEN configured' };
  }

  try {
    const check = await githubApiRequest('GET', `/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`);
    let latestSha: string | undefined = undefined;
    if (check.status === 200 && check.data && check.data.sha) {
      latestSha = check.data.sha;
      cloudSha = check.data.sha;
    } else {
      return { success: false, error: `Check SHA failed (${check.status}): ${check.raw}` };
    }

    const putRes = await githubApiRequest('PUT', `/repos/${DB_REPO}/contents/${DB_PATH}`, {
      message: 'db(sync): update tickets database in cloud',
      content: Buffer.from(JSON.stringify(tickets, null, 2), 'utf-8').toString('base64'),
      sha: latestSha || cloudSha || undefined,
      branch: 'main',
    });

    if (putRes.status === 200 || putRes.status === 201) {
      cloudSha = putRes.data?.content?.sha || cloudSha;
      console.log('Successfully saved tickets to GitHub Cloud database!');
      return { success: true };
    } else {
      console.error(`GitHub API PUT failed status ${putRes.status}:`, putRes.raw);
      return { success: false, error: `GitHub PUT failed (${putRes.status}): ${putRes.raw}` };
    }
  } catch (err: any) {
    console.error('Error saving tickets to GitHub:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export class TicketStore {
  private tickets: Ticket[] = INITIAL_TICKETS;
  private tenants: Tenant[] = INITIAL_TENANTS;

  constructor() {
    this.load();
  }

  private writeQueue: Promise<void> = Promise.resolve();

  private getStoragePath(): string {
    if (process.env.HELPUS_DB_FILE) {
      return process.env.HELPUS_DB_FILE;
    }

    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return path.join(os.tmpdir() || '/tmp', 'helpus_tickets_cache_v2.json');
    }

    try {
      // 1. Prioridade: arquivo persistente na raiz do projeto
      const projectRootPath = path.join(process.cwd(), 'helpus_tickets_cache_v2.json');
      const dir = path.dirname(projectRootPath);
      if (fs.existsSync(dir)) {
        return projectRootPath;
      }
    } catch {}

    try {
      // 2. Fallback multiplataforma (Windows: %TEMP%, Unix: TMPDIR ou /tmp)
      const systemTmp = os.tmpdir() || process.env.TMPDIR || process.env.TEMP || '/tmp';
      if (!fs.existsSync(systemTmp)) {
        fs.mkdirSync(systemTmp, { recursive: true });
      }
      return path.join(systemTmp, 'helpus_tickets_cache_v2.json');
    } catch {
      return path.join(process.cwd(), 'helpus_tickets_cache_v2.json');
    }
  }

  private atomicSaveSync(filePath: string, tickets: Ticket[]): boolean {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        console.error('Failed to create storage directory:', err);
        return false;
      }
    }

    const jsonContent = JSON.stringify(tickets, null, 2);
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
    const backupPath = `${filePath}.bak`;

    try {
      // 1. Escrita atômica em arquivo temporário
      fs.writeFileSync(tempPath, jsonContent, 'utf-8');

      // 2. Rotação do arquivo atual para backup seguro
      if (fs.existsSync(filePath)) {
        try {
          fs.copyFileSync(filePath, backupPath);
        } catch (bakErr) {
          console.warn('Backup copy rotation warning:', bakErr);
        }
      }

      // 3. Substituição atômica (renameSync com fallback de cópia para Windows)
      try {
        fs.renameSync(tempPath, filePath);
      } catch {
        fs.copyFileSync(tempPath, filePath);
        try { fs.unlinkSync(tempPath); } catch {}
      }
      return true;
    } catch (err) {
      console.error('Atomic write failed in atomicSaveSync:', err);
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      return false;
    }
  }

  private load() {
    if (typeof window !== 'undefined') {
      const savedTickets = localStorage.getItem('helpus_tickets_v1');
      if (savedTickets) {
        try {
          this.tickets = JSON.parse(savedTickets);
        } catch (e) {
          console.error('Error parsing stored tickets in browser', e);
        }
      }
    } else {
      const filePath = this.getStoragePath();
      const backupPath = `${filePath}.bak`;
      let loaded = false;

      // 1. Tentativa de carga do arquivo primário
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            this.tickets = parsed;
            loaded = true;
          }
        } catch (parseErr) {
          console.error('[Persistence] Arquivo primário corrompido, acionando auto-recuperação do backup:', parseErr);
        }
      }

      // 2. Auto-recuperação através do backup se o primário falhou ou está corrompido
      if (!loaded && fs.existsSync(backupPath)) {
        try {
          const bakContent = fs.readFileSync(backupPath, 'utf-8');
          const parsedBak = JSON.parse(bakContent);
          if (Array.isArray(parsedBak)) {
            this.tickets = parsedBak;
            console.log('[Persistence] Chamados restaurados com sucesso a partir do backup:', backupPath);
            loaded = true;
            try { fs.copyFileSync(backupPath, filePath); } catch {}
          }
        } catch (bakErr) {
          console.error('[Persistence] Falha ao ler cópia de backup:', bakErr);
        }
      }

      // 3. Fallback inicial para INITIAL_TICKETS se nada foi carregado
      if (!loaded) {
        this.tickets = INITIAL_TICKETS;
        try {
          this.atomicSaveSync(filePath, this.tickets);
        } catch {}
      }
    }
  }

  private save() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('helpus_tickets_v1', JSON.stringify(this.tickets));
    } else {
      try {
        const filePath = this.getStoragePath();
        this.atomicSaveSync(filePath, this.tickets);
      } catch (e) {
        console.error('Server storage save error', e);
      }
    }
  }

  async saveAsync(): Promise<{ success: boolean; error?: string }> {
    if (typeof window !== 'undefined') {
      localStorage.setItem('helpus_tickets_v1', JSON.stringify(this.tickets));
      return { success: true };
    }

    // Fila sequencial (Mutex) para impedir condições de corrida entre escritas concorrentes
    return new Promise((resolve) => {
      this.writeQueue = this.writeQueue.then(async () => {
        try {
          const filePath = this.getStoragePath();
          const localOk = this.atomicSaveSync(filePath, this.tickets);

          let cloudResult: { success: boolean; error?: string } = { success: true };
          if (GITHUB_TOKEN && GITHUB_TOKEN.trim()) {
            try {
              cloudResult = await saveGitHubTickets(this.tickets);
            } catch (cloudErr: any) {
              cloudResult = { success: false, error: cloudErr?.message || String(cloudErr) };
            }
          }

          resolve(cloudResult.success ? cloudResult : (localOk ? { success: true } : cloudResult));
        } catch (err: any) {
          resolve({ success: false, error: err?.message || String(err) });
        }
      });
    });
  }

  getTenants(): Tenant[] {
    return this.tenants;
  }

  getTenantById(id: string): Tenant | undefined {
    return this.tenants.find((t) => t.id === id || t.slug === id);
  }

  getTickets(tenantId?: string): Ticket[] {
    if (!tenantId || tenantId === 'all') {
      return [...this.tickets];
    }
    return this.tickets.filter((t) => t.tenantId === tenantId || t.tenantName.toLowerCase().includes(tenantId.toLowerCase()));
  }

  async getTicketsAsync(tenantId?: string): Promise<Ticket[]> {
    if (typeof window === 'undefined') {
      try {
        const cloudTickets = await fetchGitHubTickets();
        const baseTickets = (Array.isArray(cloudTickets) && cloudTickets.length > 0) ? cloudTickets : this.tickets;
        const merged = [...baseTickets];
        for (const initTicket of INITIAL_TICKETS) {
          if (!merged.some((t) => t.id === initTicket.id || t.code === initTicket.code)) {
            merged.push(initTicket);
          }
        }
        this.tickets = merged.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        try {
          const filePath = this.getStoragePath();
          this.atomicSaveSync(filePath, this.tickets);
        } catch {}
      } catch (err) {
        console.error('Cloud ticket fetch error in getTicketsAsync', err);
      }
    }

    return this.getTickets(tenantId);
  }

  getTicketById(id: string): Ticket | undefined {
    return this.tickets.find((t) => t.id === id || t.code === id);
  }

  rehydrateTicket(ticket: Ticket): Ticket {
    if (!ticket || !ticket.id) return ticket;
    const existingIndex = this.tickets.findIndex((t) => t.id === ticket.id || t.code === ticket.code);
    if (existingIndex >= 0) {
      this.tickets[existingIndex] = { ...this.tickets[existingIndex], ...ticket };
      return this.tickets[existingIndex];
    }
    this.tickets.unshift(ticket);
    try {
      this.save();
    } catch (e) {
      console.error('Error saving rehydrated ticket:', e);
    }
    return ticket;
  }

  createTicket(data: {
    tenantId: string;
    title: string;
    description: string;
    category: Ticket['category'];
    priority: Ticket['priority'];
    createdByEmail: string;
    createdByName: string;
    contextData?: Ticket['contextData'];
    attachments?: Attachment[];
  }): Ticket {
    const tenant = this.getTenantById(data.tenantId) || {
      id: data.tenantId,
      name: data.tenantId === 'aidoctor' ? 'AIDoctor' : data.tenantId === 'studionaldohair' ? 'Studio Naldo Hair' : data.tenantId === 'neuro.eduardomagalhaes' ? 'Dr. Eduardo Magalhães Neurologista (Neuro)' : data.tenantId === 'tatica' ? 'Tática Assessoria Contábil' : data.tenantId === 'fba-suite' ? 'HelpUs FBA Suite' : 'Sistema Cliente',
      slug: data.tenantId,
      domain: `${data.tenantId}.helpusbr.com`,
      apiKey: 'key',
      createdAt: new Date().toISOString(),
    };

    const existingNums = this.tickets
      .map((t) => {
        const parts = t.code.split('-');
        return parts.length > 1 ? parseInt(parts[1], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0);

    const baseNum = (data as any).clientTicketCount ? (data as any).clientTicketCount + 100 : 100;
    const maxNum = existingNums.length > 0 ? Math.max(...existingNums, baseNum) : baseNum;
    const nextNum = maxNum + 1;
    const prefix = (tenant?.id || data.tenantId || 'HLP').slice(0, 3).toUpperCase();
    const code = `${prefix}-${nextNum}`;

    const newTicket: Ticket = {
      id: `tck-${Date.now()}`,
      tenantId: tenant.id,
      tenantName: tenant.name,
      code,
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: 'pending_approval',
      createdByEmail: data.createdByEmail,
      createdByName: data.createdByName,
      contextData: data.contextData,
      attachments: data.attachments,
      messages: [
        {
          id: `msg-${Date.now()}`,
          ticketId: `tck-${Date.now()}`,
          senderId: data.createdByEmail,
          senderName: data.createdByName,
          senderRole: 'client',
          isInternalNote: false,
          content: data.description,
          attachments: data.attachments,
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tickets.unshift(newTicket);
    this.save();

    // Trigger WhatsApp & Email Alerts for Approval
    notificationService.notifyTicketCreated(newTicket);

    return newTicket;
  }

  async createTicketAsync(data: {
    tenantId: string;
    title: string;
    description: string;
    category: Ticket['category'];
    priority: Ticket['priority'];
    createdByEmail: string;
    createdByName: string;
    contextData?: Ticket['contextData'];
    attachments?: Attachment[];
    clientTicketCount?: number;
  }): Promise<Ticket> {
    const newTicket = this.createTicket(data);
    await this.saveAsync();
    return newTicket;
  }

  startTicketProduction(
    ticketId: string,
    agentName: string = 'HelpUS Master',
    adminNotes?: string,
    fallbackTicket?: Ticket
  ): Ticket | undefined {
    let ticket = this.getTicketById(ticketId);
    if (!ticket && fallbackTicket) {
      this.tickets.unshift(fallbackTicket);
      ticket = fallbackTicket;
    }
    if (!ticket) return undefined;

    if (fallbackTicket && fallbackTicket.tenantId) {
      ticket.tenantId = fallbackTicket.tenantId;
      ticket.tenantName = fallbackTicket.tenantName;
    }

    ticket.assignedTo = agentName;
    if (adminNotes && adminNotes.trim()) {
      ticket.adminNotes = adminNotes.trim();
    }
    ticket.updatedAt = new Date().toISOString();

    // 1. Approval message with optional admin notes
    let approvalContent = `✅ Aprovação Concedida pelo Administrador HelpUS (${agentName}). Autorizando envio para produção...`;
    if (adminNotes && adminNotes.trim()) {
      approvalContent += `\n\n📝 *[INSTRUÇÕES ADICIONAIS DA GESTÃO]*:\n${adminNotes.trim()}`;
    }

    ticket.messages.push({
      id: `msg-app-${Date.now()}`,
      ticketId: ticket.id,
      senderId: 'helpus-master',
      senderName: agentName,
      senderRole: 'agent',
      isInternalNote: false,
      content: approvalContent,
      createdAt: new Date().toISOString(),
    });

    // 2. Production step: ENTROU EM PRODUÇÃO (status = in_production)
    ticket.status = 'in_production';
    ticket.progressPercentage = 0;
    ticket.progressStep = '⚡ Entrada em Produção autorizada. Robô autônomo aguardando execução...';
    ticket.messages.push({
      id: `msg-prod-${Date.now() + 1}`,
      ticketId: ticket.id,
      senderId: 'ci.cd@helpusbr.com',
      senderName: 'Pipeline de Produção Vercel',
      senderRole: 'agent',
      isInternalNote: false,
      content: `⚡ *[ENTROU EM PRODUÇÃO]*: O robô autônomo iniciou o processamento do código e o envio para a nuvem Vercel (${ticket.tenantName || 'Public Arte'}). Acompanhe o progresso da compilação e verificação de deploy...`,
      createdAt: new Date().toISOString(),
    });

    // Save intermediate status "in_production" immediately to persistent storage
    this.save();

    // Notify stakeholders that ticket has ENTERED production
    notificationService.notifyTicketUpdated(
      ticket,
      `⚡ Solicitação Aprovada! O chamado [${ticket.code}] ENTROU EM PRODUÇÃO e o robô está realizando os deploys na nuvem.`
    );

    return ticket;
  }

  async startTicketProductionAsync(
    ticketId: string,
    agentName: string = 'HelpUS Master',
    adminNotes?: string,
    fallbackTicket?: Ticket
  ): Promise<{ ticket?: Ticket; cloudSaveResult?: { success: boolean; error?: string } }> {
    const ticket = this.startTicketProduction(ticketId, agentName, adminNotes, fallbackTicket);
    let cloudSaveResult;
    if (ticket) {
      cloudSaveResult = await this.saveAsync();
    }
    return { ticket, cloudSaveResult };
  }

  completeTicketProduction(
    ticketId: string,
    workerResult: {
      success: boolean;
      solutionMessage: string;
      error?: string;
    }
  ): Ticket | undefined {
    const ticket = this.getTicketById(ticketId);
    if (!ticket) return undefined;

    ticket.updatedAt = new Date().toISOString();

    if (workerResult.success) {
      ticket.status = 'resolved';
      ticket.messages.push({
        id: `msg-res-${Date.now()}`,
        ticketId: ticket.id,
        senderId: 'ia.engine@helpusbr.com',
        senderName: 'IA Autônoma (HelpUS Tech)',
        senderRole: 'agent',
        isInternalNote: false,
        content: workerResult.solutionMessage,
        createdAt: new Date().toISOString(),
      });

      this.save();

      notificationService.notifyTicketUpdated(
        ticket,
        `🎉 Solicitação [${ticket.code}] Aprovada e SOLUCIONADA/CONCLUÍDA com Sucesso no Sistema!`
      );
    } else {
      ticket.status = 'in_progress';
      ticket.messages.push({
        id: `msg-err-${Date.now()}`,
        ticketId: ticket.id,
        senderId: 'ci.cd@helpusbr.com',
        senderName: 'Pipeline de Produção Vercel (Alerta de Erro)',
        senderRole: 'agent',
        isInternalNote: false,
        content: `⚠️ *[ERRO NA IMPLANTAÇÃO EM PRODUÇÃO]*: O robô autônomo encontrou uma falha durante o deploy na nuvem:\n> ${workerResult.error || 'Falha de compilação ou timeout na Vercel'}\n\nO chamado retornou para o status *'Em Atendimento'* para revisão técnica.`,
        createdAt: new Date().toISOString(),
      });

      this.save();

      notificationService.notifyTicketUpdated(
        ticket,
        `⚠️ Alerta de Erro de Implantação no Chamado [${ticket.code}]. Retornado para Em Atendimento.`
      );
    }

    return ticket;
  }

  async updateTicketProgress(
    ticketId: string,
    percentage: number,
    stepMessage: string
  ): Promise<Ticket | undefined> {
    const ticket = this.getTicketById(ticketId);
    if (!ticket) return undefined;

    ticket.progressPercentage = Math.min(100, Math.max(0, percentage));
    ticket.progressStep = stepMessage;
    ticket.updatedAt = new Date().toISOString();

    const lastMsg = ticket.messages[ticket.messages.length - 1];
    if (!lastMsg || !lastMsg.content.includes(stepMessage)) {
      ticket.messages.push({
        id: `msg-prg-${Date.now()}`,
        ticketId: ticket.id,
        senderId: 'ci.cd@helpusbr.com',
        senderName: 'Antigravity Execution Pipeline',
        senderRole: 'agent',
        isInternalNote: false,
        content: `⚡ *[PROGRESSO ${percentage}%]*: ${stepMessage}`,
        createdAt: new Date().toISOString(),
      });
    }

    await this.saveAsync();
    return ticket;
  }

  async resetTicket(ticketId: string): Promise<Ticket | undefined> {
    let ticket = this.tickets.find((t) => t.id === ticketId || t.code === ticketId);
    if (!ticket) {
      ticket = INITIAL_TICKETS.find((t) => t.id === ticketId || t.code === ticketId);
      if (ticket) {
        this.tickets.unshift(ticket);
      }
    }
    if (!ticket) return undefined;

    ticket.status = 'pending_approval';
    ticket.progressPercentage = 0;
    delete ticket.progressStep;
    ticket.updatedAt = new Date().toISOString();

    // P1-02: Preservar histórico completo de mensagens em vez de sobrescrever
    if (!Array.isArray(ticket.messages)) {
      ticket.messages = [];
    }
    ticket.messages.push({
      id: `msg-reset-${Date.now()}`,
      ticketId: ticket.id,
      senderId: "master.superadmin@helpusbr.com",
      senderName: "Master SuperAdmin (HelpUS)",
      senderRole: "system",
      isInternalNote: true,
      content: "🔄 Chamado retornado para 'pending_approval' pelo Master SuperAdmin. Todo o histórico anterior foi integralmente preservado.",
      attachments: [],
      createdAt: new Date().toISOString()
    });

    await this.saveAsync();
    return ticket;
  }

  // Alias for backward compatibility
  async approveAndExecuteTicket(
    ticketId: string,
    agentName: string = 'HelpUS Master',
    adminNotes?: string,
    fallbackTicket?: Ticket
  ): Promise<Ticket | undefined> {
    return this.startTicketProduction(ticketId, agentName, adminNotes, fallbackTicket);
  }

  rejectTicket(
    ticketId: string,
    rejectionReason: string,
    agentName: string = 'HelpUS Master',
    fallbackTicket?: Ticket
  ): Ticket | undefined {
    let ticket = this.getTicketById(ticketId);
    if (!ticket && fallbackTicket) {
      this.tickets.unshift(fallbackTicket);
      ticket = fallbackTicket;
    }
    if (!ticket) return undefined;

    ticket.status = 'rejected';
    ticket.assignedTo = agentName;
    ticket.updatedAt = new Date().toISOString();

    const rejectMessageContent = `❌ *Solicitação Recusada pelo Administrador HelpUS (${agentName})*\n\n**Motivo da Recusa:**\n${rejectionReason}`;

    ticket.messages.push({
      id: `msg-${Date.now()}`,
      ticketId: ticket.id,
      senderId: 'helpus-master',
      senderName: agentName,
      senderRole: 'agent',
      isInternalNote: false,
      content: rejectMessageContent,
      createdAt: new Date().toISOString(),
    });

    this.save();

    // Trigger WhatsApp/Email notification of rejection
    notificationService.notifyTicketUpdated(ticket, rejectMessageContent);

    return ticket;
  }

  editTicket(
    id: string,
    updates: {
      title?: string;
      description?: string;
      category?: Ticket['category'];
      priority?: Ticket['priority'];
    },
    fallbackTicket?: Ticket
  ): Ticket | undefined {
    let ticket = this.getTicketById(id);
    if (!ticket && fallbackTicket) {
      this.tickets.unshift(fallbackTicket);
      ticket = fallbackTicket;
    }
    if (!ticket) return undefined;

    if (updates.title) ticket.title = updates.title;
    if (updates.description) ticket.description = updates.description;
    if (updates.category) ticket.category = updates.category;
    if (updates.priority) ticket.priority = updates.priority;
    ticket.updatedAt = new Date().toISOString();

    ticket.messages.push({
      id: `msg-${Date.now()}`,
      ticketId: ticket.id,
      senderId: ticket.createdByEmail,
      senderName: ticket.createdByName,
      senderRole: 'client',
      isInternalNote: false,
      content: `✏️ Solicitação editada pelo cliente. Novo título: "${ticket.title}"`,
      createdAt: new Date().toISOString(),
    });

    this.save();
    return ticket;
  }

  cancelTicket(
    id: string,
    cancellationReason: string,
    cancelledByName: string,
    fallbackTicket?: Ticket
  ): Ticket | undefined {
    let ticket = this.getTicketById(id);
    if (!ticket && fallbackTicket) {
      this.tickets.unshift(fallbackTicket);
      ticket = fallbackTicket;
    }
    if (!ticket) return undefined;

    ticket.status = 'closed';
    ticket.cancellationReason = cancellationReason;
    ticket.updatedAt = new Date().toISOString();

    const cancelMessageContent = `🗑️ *Solicitação Cancelada / Excluída pelo Cliente (${cancelledByName})*\n\n**Motivo do Cancelamento:**\n${cancellationReason}`;

    ticket.messages.push({
      id: `msg-${Date.now()}`,
      ticketId: ticket.id,
      senderId: ticket.createdByEmail,
      senderName: cancelledByName,
      senderRole: 'client',
      isInternalNote: false,
      content: cancelMessageContent,
      createdAt: new Date().toISOString(),
    });

    this.save();

    // Send email notification to master
    emailService.sendTicketCancelledEmail(ticket, cancellationReason, cancelledByName).catch((err) => console.error(err));

    return ticket;
  }

  updateTicketStatus(id: string, status: Ticket['status'], assignedTo?: string): Ticket | undefined {
    const ticket = this.getTicketById(id);
    if (!ticket) return undefined;

    ticket.status = status;
    if (status === 'pending_approval') {
      ticket.progressPercentage = 0;
      delete ticket.progressStep;
    }
    if (assignedTo !== undefined) {
      ticket.assignedTo = assignedTo;
    }
    ticket.updatedAt = new Date().toISOString();

    ticket.messages.push({
      id: `msg-${Date.now()}`,
      ticketId: ticket.id,
      senderId: 'system',
      senderName: 'Sistema',
      senderRole: 'system',
      isInternalNote: false,
      content: `Status alterado para "${(status || 'pending_approval').toUpperCase()}" por ${assignedTo || 'Atendente'}.`,
      createdAt: new Date().toISOString(),
    });

    this.save();

    // Trigger WhatsApp & Email Alert for Status Update
    notificationService.notifyTicketUpdated(ticket, `Status alterado para ${(status || 'pending_approval').toUpperCase()} por ${assignedTo || 'Atendente'}.`);

    return ticket;
  }

  addMessage(
    ticketId: string,
    message: {
      senderId: string;
      senderName: string;
      senderRole: 'client' | 'agent' | 'system';
      isInternalNote: boolean;
      content: string;
      attachments?: Attachment[];
    }
  ): Message | undefined {
    const ticket = this.getTicketById(ticketId);
    if (!ticket) return undefined;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      ticketId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderRole: message.senderRole,
      isInternalNote: message.isInternalNote,
      content: message.content,
      attachments: message.attachments,
      createdAt: new Date().toISOString(),
    };

    ticket.messages.push(newMessage);
    ticket.updatedAt = new Date().toISOString();
    
    if (message.senderRole === 'agent' && !message.isInternalNote && ticket.status === 'new') {
      ticket.status = 'in_progress';
    }

    this.save();

    if (message.senderRole === 'agent' && !message.isInternalNote) {
      notificationService.notifyTicketUpdated(ticket, message.content);
    }

    return newMessage;
  }

  async completeTicketProductionAsync(
    ticketId: string,
    workerResult: {
      success: boolean;
      solutionMessage: string;
      error?: string;
    }
  ): Promise<Ticket | undefined> {
    const ticket = this.completeTicketProduction(ticketId, workerResult);
    if (ticket) {
      await this.saveAsync();
    }
    return ticket;
  }

  async rejectTicketAsync(
    ticketId: string,
    rejectionReason: string,
    agentName: string = 'HelpUS Master',
    fallbackTicket?: Ticket
  ): Promise<Ticket | undefined> {
    const ticket = this.rejectTicket(ticketId, rejectionReason, agentName, fallbackTicket);
    if (ticket) {
      await this.saveAsync();
    }
    return ticket;
  }

  async editTicketAsync(
    id: string,
    updates: {
      title?: string;
      description?: string;
      category?: Ticket['category'];
      priority?: Ticket['priority'];
    },
    fallbackTicket?: Ticket
  ): Promise<Ticket | undefined> {
    const ticket = this.editTicket(id, updates, fallbackTicket);
    if (ticket) {
      await this.saveAsync();
    }
    return ticket;
  }

  async cancelTicketAsync(
    id: string,
    cancellationReason: string,
    cancelledByName: string,
    fallbackTicket?: Ticket
  ): Promise<Ticket | undefined> {
    const ticket = this.cancelTicket(id, cancellationReason, cancelledByName, fallbackTicket);
    if (ticket) {
      await this.saveAsync();
    }
    return ticket;
  }

  async updateTicketStatusAsync(id: string, status: Ticket['status'], assignedTo?: string): Promise<Ticket | undefined> {
    const ticket = this.updateTicketStatus(id, status, assignedTo);
    if (ticket) {
      await this.saveAsync();
    }
    return ticket;
  }

  async addMessageAsync(
    ticketId: string,
    message: {
      senderId: string;
      senderName: string;
      senderRole: 'client' | 'agent' | 'system';
      isInternalNote: boolean;
      content: string;
      attachments?: Attachment[];
    }
  ): Promise<Message | undefined> {
    const msg = this.addMessage(ticketId, message);
    if (msg) {
      await this.saveAsync();
    }
    return msg;
  }

  async closeTicketAsync(id: string, clientFeedback?: string, closedByName?: string): Promise<Ticket | undefined> {
    const ticket = this.getTicketById(id);
    if (!ticket) return undefined;

    ticket.status = 'closed';
    ticket.updatedAt = new Date().toISOString();

    const closeMsg = clientFeedback
      ? `✅ *Chamado Concluído & Encerrado pelo Cliente (${closedByName || 'Cliente'})*\n\nAvaliação / Feedback: ${clientFeedback}`
      : `✅ *Chamado Concluído & Encerrado com Sucesso pelo Cliente (${closedByName || 'Cliente'})*`;

    ticket.messages.push({
      id: `msg-${Date.now()}`,
      ticketId: ticket.id,
      senderId: ticket.createdByEmail,
      senderName: closedByName || 'Cliente',
      senderRole: 'client',
      isInternalNote: false,
      content: closeMsg,
      createdAt: new Date().toISOString(),
    });

    await this.saveAsync();
    return ticket;
  }

  async reopenTicketAsync(id: string, reason: string, reopenedByName?: string): Promise<Ticket | undefined> {
    const ticket = this.getTicketById(id);
    if (!ticket) return undefined;

    ticket.status = 'pending_approval';
    ticket.progressPercentage = 0;
    delete ticket.progressStep;
    ticket.updatedAt = new Date().toISOString();

    const reopenMsg = `🔄 *Chamado Reaberto pelo Cliente (${reopenedByName || 'Cliente'})*\n\nMotivo da Reabertura: ${reason}\n\n*Aguardando Nova Aprovação Master para Envio a Produção.*`;

    ticket.messages.push({
      id: `msg-${Date.now()}`,
      ticketId: ticket.id,
      senderId: ticket.createdByEmail,
      senderName: reopenedByName || 'Cliente',
      senderRole: 'client',
      isInternalNote: false,
      content: reopenMsg,
      createdAt: new Date().toISOString(),
    });

    await this.saveAsync();
    return ticket;
  }
}

export const ticketStore = new TicketStore();
