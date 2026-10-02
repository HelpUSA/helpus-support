import fs from 'fs';
import path from 'path';
import { Ticket, Tenant, Message, Attachment } from '@/types/ticket';
import { INITIAL_TENANTS } from '@/lib/tenants';
import { notificationService } from '@/lib/notifications';
import { emailService } from '@/lib/emailService';
import { getAutoResolutionDetails } from '@/lib/aiResolver';
import { aiAutoCodingWorker } from '@/lib/aiWorker';
export { INITIAL_TENANTS };

export const INITIAL_TICKETS: Ticket[] = [];

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const DB_REPO = 'HelpUSA/publicarte';
const DB_PATH = 'data/helpus_tickets.json';

let cloudSha: string | null = null;

async function fetchGitHubTickets(): Promise<Ticket[]> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'HelpUS-Support-Hub',
      Accept: 'application/vnd.github+json',
    };
    if (GITHUB_TOKEN && GITHUB_TOKEN.trim()) {
      headers.Authorization = `Bearer ${GITHUB_TOKEN.trim()}`;
    }

    const res = await fetch(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}`, {
      headers,
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      cloudSha = data.sha;
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const tickets: Ticket[] = JSON.parse(content);
      return tickets;
    }

    // Fallback: Fetch raw GitHub content directly
    const rawRes = await fetch(`https://raw.githubusercontent.com/${DB_REPO}/main/${DB_PATH}`, {
      cache: 'no-store',
    });
    if (rawRes.ok) {
      const tickets: Ticket[] = await rawRes.json();
      return tickets;
    }
  } catch (err) {
    console.error('Error fetching tickets from GitHub:', err);
    try {
      const rawRes = await fetch(`https://raw.githubusercontent.com/${DB_REPO}/main/${DB_PATH}`, {
        cache: 'no-store',
      });
      if (rawRes.ok) {
        const tickets: Ticket[] = await rawRes.json();
        return tickets;
      }
    } catch {}
  }
  return [];
}

async function saveGitHubTickets(tickets: Ticket[]): Promise<void> {
  if (!GITHUB_TOKEN || !GITHUB_TOKEN.trim()) return;

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${GITHUB_TOKEN.trim()}`,
      'User-Agent': 'HelpUS-Support-Hub',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    };

    if (!cloudSha) {
      const check = await fetch(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}`, {
        headers,
        cache: 'no-store',
      });
      if (check.ok) {
        const d = await check.json();
        cloudSha = d.sha;
      }
    }

    const res = await fetch(`https://api.github.com/repos/${DB_REPO}/contents/${DB_PATH}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'db(sync): update tickets database in cloud',
        content: Buffer.from(JSON.stringify(tickets, null, 2), 'utf-8').toString('base64'),
        sha: cloudSha || undefined,
        branch: 'main',
      }),
    });

    if (res.ok) {
      const d = await res.json();
      cloudSha = d?.content?.sha || cloudSha;
    }
  } catch (err) {
    console.error('Error saving tickets to GitHub:', err);
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
      saveGitHubTickets(this.tickets).catch((err) => console.error('Cloud save failed', err));
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
        if (Array.isArray(cloudTickets)) {
          this.tickets = cloudTickets;
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
    const prefix = tenant.id.slice(0, 3).toUpperCase();
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
      content: `Status alterado para "${status.toUpperCase()}" por ${assignedTo || 'Atendente'}.`,
      createdAt: new Date().toISOString(),
    });

    this.save();

    // Trigger WhatsApp & Email Alert for Status Update
    notificationService.notifyTicketUpdated(ticket, `Status alterado para ${status.toUpperCase()} por ${assignedTo || 'Atendente'}.`);

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
}

export const ticketStore = new TicketStore();
