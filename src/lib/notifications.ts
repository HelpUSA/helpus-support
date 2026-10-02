import { Ticket } from '@/types/ticket';
import { emailService, EMAIL_CONFIG } from '@/lib/emailService';

export interface NotificationLog {
  id: string;
  type: 'ticket_created' | 'ticket_resolved' | 'ticket_replied';
  targetEmail: string;
  emailSubject: string;
  emailBody: string;
  status: 'sent' | 'pending';
  timestamp: string;
}

export const NOTIFICATION_CONFIG = {
  emailTarget: EMAIL_CONFIG.masterTarget, // helpusbr.ecommerce@gmail.com
};

class NotificationService {
  private logs: NotificationLog[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('helpus_notif_logs_v2');
      if (saved) {
        try {
          this.logs = JSON.parse(saved);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  private save() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('helpus_notif_logs_v2', JSON.stringify(this.logs));
    }
  }

  getLogs(): NotificationLog[] {
    return [...this.logs];
  }

  notifyTicketCreated(ticket: Ticket): NotificationLog {
    const emailSubject = `[HelpUS Support] 🔔 Solicitação ${ticket.code} Aguardando Aprovação — ${ticket.tenantName}: ${ticket.title}`;
    const emailBody = `
==================================================
HELPUS SUPPORT HUB — ALERTA DE NOVA SOLICITAÇÃO
==================================================

Uma nova solicitação foi aberta e aguarda aprovação no painel master:

- Código do Chamado: ${ticket.code}
- Cliente (Empresa): ${ticket.tenantName}
- Solicitante: ${ticket.createdByName} <${ticket.createdByEmail}>
- Categoria: ${ticket.category.toUpperCase()}
- Prioridade: ${ticket.priority.toUpperCase()}
- Data/Hora: ${new Date(ticket.createdAt).toLocaleString('pt-BR')}

DESCRIÇÃO DA SOLICITAÇÃO:
--------------------------------------------------
${ticket.description}

Para APROVAR e EXECUTAR as alterações ou REJEITAR a solicitação, acesse o painel administrativo:
https://support.helpusbr.com/portal (Faça login como "helpus")
    `.trim();

    const log: NotificationLog = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'ticket_created',
      targetEmail: NOTIFICATION_CONFIG.emailTarget,
      emailSubject,
      emailBody,
      status: 'sent',
      timestamp: new Date().toISOString(),
    };

    this.logs.unshift(log);
    this.save();

    // Trigger async email dispatch to helpusbr.ecommerce@gmail.com
    emailService.sendNewTicketEmail(ticket).catch((err) => console.error(err));

    return log;
  }

  notifyTicketUpdated(ticket: Ticket, messageOrSolution?: string): NotificationLog {
    const solutionText = messageOrSolution || 'Chamado processado e atualizado pela equipe HelpUS.';

    const emailSubject = `[HelpUS Support] 🟢 Chamado ${ticket.code} Atualizado/Solucionado — ${ticket.tenantName}`;
    const emailBody = `
==================================================
HELPUS SUPPORT HUB — ALERTA DE ATUALIZAÇÃO / SOLUÇÃO
==================================================

O chamado ${ticket.code} foi atualizado para [${ticket.status.toUpperCase()}].

DETALHES DO CHAMADO:
- Código: ${ticket.code}
- Cliente: ${ticket.tenantName}
- Solicitante: ${ticket.createdByName} (${ticket.createdByEmail})
- Solicitação Original: ${ticket.title}

RESPOSTA / SOLUÇÃO PRESTADA:
--------------------------------------------------
${solutionText}

Data da Atualização: ${new Date().toLocaleString('pt-BR')}

Acompanhe o portal do cliente:
https://support.helpusbr.com/portal
    `.trim();

    const log: NotificationLog = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: ticket.status === 'resolved' || ticket.status === 'closed' ? 'ticket_resolved' : 'ticket_replied',
      targetEmail: NOTIFICATION_CONFIG.emailTarget,
      emailSubject,
      emailBody,
      status: 'sent',
      timestamp: new Date().toISOString(),
    };

    this.logs.unshift(log);
    this.save();

    // Trigger async email dispatch
    emailService.sendTicketStatusUpdateEmail(ticket, solutionText).catch((err) => console.error(err));

    return log;
  }
}

export const notificationService = new NotificationService();
