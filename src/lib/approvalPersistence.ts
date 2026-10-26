import type { Ticket } from '@/types/ticket';
export type ApprovalPersistenceCheck =
  | { ok: true }
  | { ok: false; httpStatus: 409 | 503; code: string; message: string };
/**
 * A seeded/browser-cached ticket is not proof of a durable request.
 * Fail closed before approving unless the shared store has the ticket.
 */
export function checkDurableApprovalSource(
  canonicalTickets: Ticket[] | null, ticketId: string, expectedTenantId?: string
): ApprovalPersistenceCheck {
  if (!Array.isArray(canonicalTickets)) return { ok:false, httpStatus:503,
    code:'SHARED_TICKET_STORE_UNAVAILABLE',
    message:'A base persistente está indisponível. Aprovação bloqueada; nenhuma execução foi iniciada.' };
  const remote=canonicalTickets.find(t=>t && (t.id===ticketId || t.code===ticketId));
  if (!remote) return { ok:false, httpStatus:409,
    code:'TICKET_NOT_DURABLY_REGISTERED',
    message:'O chamado existe apenas no catálogo/cache do portal e não na base persistente. Aprovação bloqueada; nenhuma execução foi iniciada.' };
  if (expectedTenantId && remote.tenantId!==expectedTenantId)
    return {ok:false,httpStatus:409,code:'REMOTE_TENANT_MISMATCH',
      message:'Os dados do tenant divergem da base compartilhada. Aprovação bloqueada.'};
  if (remote.status!=='pending_approval' && remote.status!=='new')
    return {ok:false,httpStatus:409,code:'REMOTE_TICKET_NOT_AWAITING_APPROVAL',
      message:'O chamado não aguarda aprovação na base persistente. Atualize o portal antes de novas ações.'};
  return {ok:true};
}
