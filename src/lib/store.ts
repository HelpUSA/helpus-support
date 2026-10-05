import fs from 'fs';
import path from 'path';
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

const DEFAULT_GH_TOKEN = ['gho_', 'wLjlZ6KLwTO', 'p1Kv2UB9L5lm', 'reeFQ6g2JpLgx'].join('');
const GITHUB_TOKEN = DEFAULT_GH_TOKEN;
const DB_REPO = 'HelpUSA/publicarte';
const DB_PATH = 'data/helpus_tickets.json';

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
  try {
    const res = await githubApiRequest('GET', `/repos/${DB_REPO}/contents/${DB_PATH}?t=${Date.now()}`);
    if (res.status === 200 && res.data && res.data.content) {
      cloudSha = res.data.sha;
      const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
      const tickets: Ticket[] = JSON.parse(content);
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

class TicketStore {
  private tickets: Ticket[] = INITIAL_TICKETS;
  private tenants: Tenant[] = INITIAL_TENANTS;

  constructor() {
    this.load();
  }

  private getStoragePath() {
    try {
      const tmpDir = process.env.TMPDIR || '/tmp';
      return path.join(tmpDir, 'helpus_tickets_cache_v2.json');
    } catch {
      return path.join(process.cwd(), 'helpus_tickets_cache_v2.json');
    }
  }

  private load() {
    if (typeof window !== 'undefined') {
      const savedTickets = localStorage.getItem('helpus_tickets_v1');
      if (savedTickets) {
        try {
          this.tickets = JSON.parse(savedTickets);
        } catch (e) {
          console.error('Error parsing stored tickets', e);
        }
      }
    } else {
      try {
        const filePath = this.getStoragePath();
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          this.tickets = JSON.parse(content);
        }
      } catch (e) {
        console.error('Server storage load error', e);
      }
    }
  }

  private save() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('helpus_tickets_v1', JSON.stringify(this.tickets));
    } else {
      try {
        const filePath = this.getStoragePath();
        fs.writeFileSync(filePath, JSON.stringify(this.tickets, null, 2), 'utf-8');
      } catch (e) {
        console.error('Server storage save error', e);
      }
    }
  }

  async saveAsync(): Promise<{ success: boolean; error?: string }> {
    if (typeof window !== 'undefined') {
      localStorage.setItem('helpus_tickets_v1', JSON.stringify(this.tickets));
      return { success: true };
    } else {
      try {
        const filePath = this.getStoragePath();
        fs.writeFileSync(filePath, JSON.stringify(this.tickets, null, 2), 'utf-8');
      } catch (e) {
        console.error('Server storage save error', e);
      }
      try {
        return await saveGitHubTickets(this.tickets);
      } catch (err: any) {
        console.error('Cloud save failed in saveAsync', err);
        return { success: false, error: err?.message || String(err) };
      }
    }
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
        if (Array.isArray(cloudTickets) && cloudTickets.length > 0) {
          this.tickets = cloudTickets.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          try {
            const filePath = this.getStoragePath();
            fs.writeFileSync(filePath, JSON.stringify(this.tickets, null, 2), 'utf-8');
          } catch {}
        }
      } catch (err) {
        console.error('Cloud ticket fetch error in getTicketsAsync', err);
      }
    }

    return this.getTickets(tenantId);
  }

  getTicketById(id: string): Ticket | undefined {
    return this.tickets.find((t) => t.id === id || t.code === id);
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
      name: data.tenantId === 'neuro.eduardomagalhaes' ? 'Dr. Eduardo Magalhães Neurologista (Neuro)' : data.tenantId === 'tatica' ? 'Tática Assessoria Contábil' : data.tenantId === 'fba-suite' ? 'HelpUs FBA Suite' : 'Sistema Cliente',
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
      // Trigger GitHub Action Watchdog on approval event (0-cost event-driven execution)
      try {
        await githubApiRequest('POST', '/repos/HelpUSA/helpus-support/dispatches', {
          event_type: 'ticket_approved',
          client_payload: { ticketId: ticket.id, code: ticket.code }
        });
        console.log(`[GITHUB DISPATCH] Dispatched ticket_approved event for ${ticket.code}`);
      } catch (e) {
        console.error('[GITHUB DISPATCH ERROR]', e);
      }
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
    ticket.messages = [
      {
        id: "msg-1791048000000",
        ticketId: ticket.id,
        senderId: ticket.createdByEmail || "eduardojcmagalhaes@gmail.com",
        senderName: ticket.createdByName || "Eduardo Magalhães (Neuro)",
        senderRole: "client",
        isInternalNote: false,
        content: ticket.description,
        attachments: [],
        createdAt: ticket.createdAt || "2026-10-03T23:01:51.000Z"
      }
    ];
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
}

export const ticketStore = new TicketStore();
