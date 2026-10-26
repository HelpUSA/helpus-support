import { createHmac, randomUUID } from 'node:crypto';
import type { Ticket, TicketEvent } from '@/types/ticket';
import { computeEventPayload, isAuthorizedSuperAdminEmail } from '@/lib/serverAuth';

export const SANDBOX_REPO = 'HelpUSA/helpus-support-sandbox';
export const SANDBOX_PATH = 'data/support_sbx_tickets.json';
export const SANDBOX_TARGET = 'SBX-E2E-063';

export type SandboxGate = {ok:true;token:string;signingKey:string} |
  {ok:false;reason:string};

export function sandboxApprovalGate(env: NodeJS.ProcessEnv): SandboxGate {
  // Must be an expressly isolated deployment. Never enable on Vercel production.
  if (env.HELPUS_STAGING_APPROVAL_ENABLED !== '1' ||
      env.HELPUS_STAGING_ISOLATED_MODE !== '1' ||
      env.HELPUS_STAGING_DEPLOYMENT !== 'sandbox' ||
      env.VERCEL_ENV === 'production') {
    return {ok:false,reason:'sandbox_approval_disabled'};
  }
  if (env.HELPUS_SANDBOX_DB_REPO !== SANDBOX_REPO ||
      env.HELPUS_SANDBOX_DB_PATH !== SANDBOX_PATH ||
      (env.HELPUS_SANDBOX_DB_REF || 'main') !== 'main' ||
      env.HELPUS_STAGING_APPROVAL_TICKET_ID !== SANDBOX_TARGET) {
    return {ok:false,reason:'sandbox_target_configuration_invalid'};
  }
  const token=env.HELPUS_STAGING_GITHUB_TOKEN||'';
  const signingKey=env.HELPUS_STAGING_EVENT_HMAC_SECRET||'';
  if(token.length<20 || signingKey.length<32 ||
     token===env.GITHUB_TOKEN || token===env.GH_TOKEN ||
     signingKey===env.EVENT_HMAC_SECRET || signingKey===env.TICKET_EVENT_SECRET ||
     token.includes('\n') || signingKey.includes('\n')) {
    return {ok:false,reason:'isolated_staging_credentials_required'};
  }
  return {ok:true,token,signingKey};
}
const ID=/^SBX-[A-Z0-9]{1,24}(?:-[A-Z0-9]{1,24}){0,3}$/;

export function checkSandboxSnapshot(tickets: unknown): tickets is Ticket[] {
  return Array.isArray(tickets) && tickets.length>0 && tickets.length<=100 &&
    tickets.every(t=>t && typeof t==='object' &&
      ID.test(t.id) && t.code===t.id && t.tenantId==='sandbox' &&
      Array.isArray(t.events) && Array.isArray(t.messages) &&
      typeof t.status==='string');
}

export function approveOneSandboxTicket(
  tickets: Ticket[], id: string, masterEmail: string, signingKey: string,
  now: Date = new Date()
): {ok:true;tickets:Ticket[];approvalEventId:string;jobKey:string} |
   {ok:false;reason:string} {
  if(id!==SANDBOX_TARGET || !ID.test(id))return {ok:false,reason:'sandbox_target_only'};
  if(!isAuthorizedSuperAdminEmail(masterEmail))
    return {ok:false,reason:'master_identity_not_authorized'};
  if(signingKey.length<32)return {ok:false,reason:'sandbox_signing_key_missing'};
  if(!checkSandboxSnapshot(tickets))return {ok:false,reason:'sandbox_snapshot_invalid'};
  const matches=tickets.filter(t=>t.id===id);
  if(matches.length!==1)return {ok:false,reason:'sandbox_ticket_not_unique'};
  const ticket=matches[0];
  if(ticket.status!=='pending_approval'||Number(ticket.progressPercentage||0)!==0)
    return {ok:false,reason:'sandbox_ticket_not_pending'};
  // Initial synthetic seed only: do not bless existing unverified event history.
  if(ticket.events!.length!==0)return {ok:false,reason:'unverified_event_history'};
  const approvedAt=now.toISOString();
  const eventId='evt-appr-'+randomUUID();
  const jobKey='helpus-approval-outbox-v1:'+id+':'+eventId;
  const event:TicketEvent={
    id:eventId,ticketId:id,tenantId:'sandbox',type:'master_approved',
    actorEmail:masterEmail.toLowerCase().trim(),actorRole:'master_superadmin',
    authorized:true,progressPercentage:0,status:'in_production',
    note:'Autorizacao Master de homologacao registrada. Nenhuma execucao ou deploy iniciado.',
    timestamp:approvedAt,seq:1,idempotencyKey:jobKey
  };
  event.signature=createHmac('sha256',signingKey).update(computeEventPayload(event)).digest('hex');
  const next=tickets.map(t=>t.id!==id?t:{
    ...t,status:'in_production' as const,progressPercentage:0,
    progressStep:'Aprovado em homologacao — aguardando entrega comprovada ao gateway local.',
    updatedAt:approvedAt,events:[event]
  });
  return {ok:true,tickets:next,approvalEventId:eventId,jobKey};
}
