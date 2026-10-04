import nodemailer from 'nodemailer';
import { Ticket } from '@/types/ticket';

export const EMAIL_CONFIG = {
  masterTarget: 'helpus.ecommerce@gmail.com',
  fromAddress: '"HelpUS Support Hub" <helpus.ecommerce@gmail.com>',
};

export interface EmailLog {
  id: string;
  ticketId: string;
  recipient: string;
  subject: string;
  htmlBody: string;
  status: 'sent' | 'queued' | 'simulated';
  timestamp: string;
}

class EmailNotificationService {
  private logs: EmailLog[] = [];

  private getTransporter() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    if (!user || !pass) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  getLogs(): EmailLog[] {
    return [...this.logs];
  }

  async sendNewTicketEmail(ticket: Ticket): Promise<EmailLog> {
    const recipients = [EMAIL_CONFIG.masterTarget, 'eduardojcmagalhaes@gmail.com', ticket.createdByEmail].filter(Boolean).join(', ');
    const subject = `[HelpUS Support] 🔔 Nova Solicitação ${ticket.code} — ${ticket.tenantName}: ${ticket.title}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; borderRadius: 16px;">
        <div style="border-bottom: 2px solid #6366f1; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #818cf8; margin: 0;">HelpUS Support Hub</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 4px 0 0 0;">Alerta de Nova Solicitação de Atendimento</p>
        </div>

        <div style="background-color: #1e293b; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
          <p style="margin: 6px 0;"><strong>🎫 Código:</strong> <span style="color: #818cf8; font-family: monospace; font-weight: bold;">${ticket.code}</span></p>
          <p style="margin: 6px 0;"><strong>🏢 Cliente (Empresa):</strong> ${ticket.tenantName}</p>
          <p style="margin: 6px 0;"><strong>👤 Solicitante:</strong> ${ticket.createdByName} (&lt;${ticket.createdByEmail}&gt;)</p>
          <p style="margin: 6px 0;"><strong>⚠️ Prioridade:</strong> ${(ticket.priority || 'medium').toUpperCase()}</p>
          <p style="margin: 6px 0;"><strong>📅 Data/Hora:</strong> ${new Date(ticket.createdAt).toLocaleString('pt-BR')}</p>
        </div>

        <div style="background-color: #020617; padding: 16px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 24px;">
          <h4 style="color: #e2e8f0; margin-top: 0;">📌 Descrição da Solicitação:</h4>
          <p style="color: #cbd5e1; white-space: pre-wrap; line-height: 1.6;">${ticket.description}</p>
        </div>

        <div style="text-align: center; margin-top: 24px;">
          <a href="https://support.helpusbr.com/portal" style="background-color: #6366f1; color: #ffffff; padding: 12px 24px; font-weight: bold; border-radius: 8px; text-decoration: none; display: inline-block;">
            👑 Acessar Área Master para Aprovar ou Rejeitar
          </a>
        </div>
      </div>
    `;

    return this.dispatch(ticket.id, recipients, subject, htmlBody);
  }

  async sendTicketStatusUpdateEmail(ticket: Ticket, statusText: string): Promise<EmailLog> {
    const recipients = [EMAIL_CONFIG.masterTarget, ticket.createdByEmail].filter(Boolean).join(', ');
    const subject = `[HelpUS Support] 🟢 Chamado ${ticket.code} Atualizado — Status: ${(ticket.status || 'pending_approval').toUpperCase()}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 16px;">
        <div style="border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #34d399; margin: 0;">HelpUS Support Hub</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 4px 0 0 0;">Atualização de Atendimento de Chamado</p>
        </div>

        <div style="background-color: #1e293b; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
          <p style="margin: 6px 0;"><strong>🎫 Código:</strong> <span style="color: #34d399; font-family: monospace; font-weight: bold;">${ticket.code}</span></p>
          <p style="margin: 6px 0;"><strong>🏢 Cliente:</strong> ${ticket.tenantName}</p>
          <p style="margin: 6px 0;"><strong>📌 Solicitação:</strong> ${ticket.title}</p>
          <p style="margin: 6px 0;"><strong>📊 Novo Status:</strong> <span style="color: #f59e0b; font-weight: bold;">${(ticket.status || 'pending_approval').toUpperCase()}</span></p>
        </div>

        <div style="background-color: #020617; padding: 16px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 24px;">
          <h4 style="color: #e2e8f0; margin-top: 0;">💬 Detalhes da Atualização:</h4>
          <p style="color: #cbd5e1; white-space: pre-wrap; line-height: 1.6;">${statusText}</p>
        </div>

        <div style="text-align: center; margin-top: 24px;">
          <a href="https://support.helpusbr.com/portal" style="background-color: #10b981; color: #ffffff; padding: 12px 24px; font-weight: bold; border-radius: 8px; text-decoration: none; display: inline-block;">
            Ver Acompanhamento no Portal do Cliente
          </a>
        </div>
      </div>
    `;

    return this.dispatch(ticket.id, recipients, subject, htmlBody);
  }

  async sendTicketCancelledEmail(ticket: Ticket, cancellationReason: string, cancelledByName: string): Promise<EmailLog> {
    const recipients = [EMAIL_CONFIG.masterTarget, ticket.createdByEmail].filter(Boolean).join(', ');
    const subject = `[HelpUS Support] 🗑️ Chamado ${ticket.code} Cancelado/Excluído pelo Cliente — ${ticket.tenantName}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 16px;">
        <div style="border-bottom: 2px solid #ef4444; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #f87171; margin: 0;">HelpUS Support Hub</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 4px 0 0 0;">Alerta de Cancelamento de Solicitação pelo Cliente</p>
        </div>

        <div style="background-color: #1e293b; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
          <p style="margin: 6px 0;"><strong>🎫 Código:</strong> <span style="color: #f87171; font-family: monospace; font-weight: bold;">${ticket.code}</span></p>
          <p style="margin: 6px 0;"><strong>🏢 Cliente:</strong> ${ticket.tenantName}</p>
          <p style="margin: 6px 0;"><strong>👤 Cancelado Por:</strong> ${cancelledByName}</p>
          <p style="margin: 6px 0;"><strong>📌 Solicitação Original:</strong> ${ticket.title}</p>
        </div>

        <div style="background-color: #020617; padding: 16px; border-radius: 12px; border: 1px solid #7f1d1d; margin-bottom: 24px;">
          <h4 style="color: #fca5a5; margin-top: 0;">📝 Observação de Cancelamento do Cliente:</h4>
          <p style="color: #fecdd3; white-space: pre-wrap; line-height: 1.6;">${cancellationReason}</p>
        </div>

        <div style="text-align: center; margin-top: 24px;">
          <a href="https://support.helpusbr.com/portal" style="background-color: #ef4444; color: #ffffff; padding: 12px 24px; font-weight: bold; border-radius: 8px; text-decoration: none; display: inline-block;">
            Acessar Área Master de Chamados
          </a>
        </div>
      </div>
    `;

    return this.dispatch(ticket.id, recipients, subject, htmlBody);
  }

  private cleanRecipientEmail(rawRecipient: string): string {
    if (!rawRecipient) return EMAIL_CONFIG.masterTarget;
    const list = rawRecipient.split(',').map((e) => e.trim()).filter(Boolean);
    const cleanedList = list.map((email) => {
      const lower = email.toLowerCase();
      if (lower.endsWith('@publicarte.com.br') || lower.includes('publicarte.com.br')) {
        return 'publicarte09@gmail.com';
      }
      if (lower.endsWith('@helpusbr.com') && lower.includes('eduardo')) {
        return 'eduardojcmagalhaes@gmail.com';
      }
      return email;
    });
    return Array.from(new Set(cleanedList)).join(', ');
  }

  private async dispatch(ticketId: string, recipient: string, subject: string, htmlBody: string): Promise<EmailLog> {
    const finalRecipient = this.cleanRecipientEmail(recipient);

    const log: EmailLog = {
      id: `mail-${Date.now()}`,
      ticketId,
      recipient: finalRecipient,
      subject,
      htmlBody,
      status: 'simulated',
      timestamp: new Date().toISOString(),
    };

    const transporter = this.getTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: EMAIL_CONFIG.fromAddress,
          to: finalRecipient,
          subject,
          html: htmlBody,
        });
        log.status = 'sent';
      } catch (err) {
        console.error('Error sending email via SMTP:', err);
      }
    }

    this.logs.unshift(log);
    return log;
  }
}

export const emailService = new EmailNotificationService();
