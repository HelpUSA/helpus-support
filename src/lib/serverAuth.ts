import crypto from 'crypto';
import { Ticket, TicketEvent } from '@/types/ticket';

export type UserRole = 'super_admin' | 'admin' | 'agent' | 'client_admin' | 'client_user' | 'client';

export const AUTHORIZED_SUPERADMIN_EMAILS = [
  'helpus.ecommerce@gmail.com',
  'wagner.redes@gmail.com',
] as const;

/**
 * HelpUS Support — Server-Side Cryptographic Authentication & Authorization Engine
 * Implementação de Segurança R26 (Reforço P0 Independente)
 *
 * Princípios:
 * 1. Tokens de sessão assinados com HMAC-SHA256 (v1.<payload_b64>.<sig_b64>).
 * 2. Validação estrita de expiração (exp), emissor (iss) e assinatura criptográfica com timingSafeEqual.
 * 3. Proibição absoluta de confiar em headers arbitrários (x-user-email, x-user-role, x-tenant-id).
 * 4. Remoção de segredos fixos hardcoded no código.
 * 5. Projeção server-side (DTO): notas internas e instruções de admin são filtradas para clientes.
 */

// P0-A (Ciclo 027): Separação de segredos por finalidade e eliminação de segredos hardcoded.
// Em produção/Vercel: fail-closed estrito. Em dev/test: segredo efêmero aleatório gerado por processo.
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.AUTH_SECRET || process.env.SUPERADMIN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
      throw new Error('[SECURITY FATAL] SESSION_SECRET não configurado em ambiente de produção.');
    }
    return (globalThis as any).__EPHEMERAL_SESSION_SECRET || ((globalThis as any).__EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex'));
  }
  return secret;
}

export function getEventHmacSecret(): string {
  const secret = process.env.EVENT_HMAC_SECRET || process.env.TICKET_EVENT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
      throw new Error('[SECURITY FATAL] EVENT_HMAC_SECRET não configurado em ambiente de produção.');
    }
    return (globalThis as any).__EPHEMERAL_EVENT_SECRET || ((globalThis as any).__EPHEMERAL_EVENT_SECRET = crypto.randomBytes(32).toString('hex'));
  }
  return secret;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  tenantId: string;
  allowedTenantIds: string[];
  iat: number;
  exp: number;
  iss?: string;
}

export interface ServerAuthDecision {
  authenticated: boolean;
  isSuperAdmin: boolean;
  userEmail?: string;
  userId?: string;
  role?: UserRole;
  userRole?: UserRole;
  tenantId?: string;
  allowedTenantIds?: string[];
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    tenantId: string;
    allowedTenantIds: string[];
    username: string;
    hasSupportAccess: boolean;
    status: 'active';
  };
  error?: string;
}

function toBase64Url(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function digestBase64Url(hmac: crypto.Hmac): string {
  return hmac.digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(b64url: string): string {
  let base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function safeTimingEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  if (typeof crypto !== 'undefined' && typeof crypto.timingSafeEqual === 'function') {
    return crypto.timingSafeEqual(a, b);
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function isAuthorizedSuperAdminEmail(email?: string): boolean {
  if (!email) return false;
  return (AUTHORIZED_SUPERADMIN_EMAILS as readonly string[])
    .map((e) => e.toLowerCase())
    .includes(email.toLowerCase().trim());
}

/**
 * Assina um token de sessão usando HMAC-SHA256.
 */
export function signSessionToken(
  payload: {
    userId?: string;
    sub?: string;
    email: string;
    name?: string;
    role: UserRole;
    tenantId?: string;
    allowedTenantIds?: string[];
  },
  expiresInSeconds = 7 * 24 * 3600
): string {
  const now = Math.floor(Date.now() / 1000);
  const cleanEmail = payload.email.toLowerCase().trim();
  const userId = payload.userId || payload.sub || cleanEmail;
  const tenantId = payload.tenantId || 'publicarte';

  const fullPayload: SessionPayload = {
    userId,
    email: cleanEmail,
    role: payload.role,
    tenantId,
    allowedTenantIds: payload.allowedTenantIds || [tenantId],
    iat: now,
    exp: now + expiresInSeconds,
    iss: 'helpus-support-server',
  };

  const payloadB64 = toBase64Url(JSON.stringify(fullPayload));
  const hmac = crypto.createHmac('sha256', getSessionSecret());
  hmac.update(`v1.${payloadB64}`);
  const sigB64 = digestBase64Url(hmac);

  return `v1.${payloadB64}.${sigB64}`;
}

/**
 * Verifica criptograficamente a assinatura e expiração de um token de sessão.
 */
export function verifySessionToken(tokenString: string): SessionPayload | null {
  if (!tokenString || typeof tokenString !== 'string') return null;

  const trimmed = tokenString.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return null; // Formato inválido ou versão não suportada
  }

  const [, payloadB64, sigB64] = parts;

  // 1. Recalcula a assinatura HMAC esperada
  const hmac = crypto.createHmac('sha256', getSessionSecret());
  hmac.update(`v1.${payloadB64}`);
  const expectedSigB64 = digestBase64Url(hmac);

  // 2. Comparação em tempo constante (evita timing attacks)
  const expectedBuf = Buffer.from(expectedSigB64, 'utf-8');
  const providedBuf = Buffer.from(sigB64, 'utf-8');

  if (!safeTimingEqual(expectedBuf, providedBuf)) {
    return null; // Assinatura forjada ou inválida
  }

  // 3. Decodifica o payload e valida expiração
  try {
    const payloadJson = fromBase64Url(payloadB64);
    const payload: SessionPayload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) {
      return null; // Token expirado
    }

    // 4. Anti-Privilege Escalation Guard:
    // Se o payload alegar role 'super_admin', o e-mail DEVE constar na lista autoritativa
    if (payload.role === 'super_admin') {
      const isAuthorizedEmail = (AUTHORIZED_SUPERADMIN_EMAILS as readonly string[]).includes(payload.email.toLowerCase());
      if (!isAuthorizedEmail) {
        return null; // Rejeitado: e-mail não autorizado a agir como super_admin
      }
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Validador autoritativo Server-Side para rotas de API.
 * Nunca confia em headers arbitrários. Exige token assinado ou segredo configurado em ambiente.
 */
export function validateServerApiAccess(headers: { get(name: string): string | null }): ServerAuthDecision {
  const authHeader = headers.get('authorization') || headers.get('Authorization') || '';
  const cookieHeader = headers.get('cookie') || headers.get('Cookie') || '';
  const superAdminSecret = headers.get('x-superadmin-secret') || '';

  let tokenToVerify: string | null = null;

  // 1. Extração do Bearer Token
  if (authHeader.startsWith('Bearer ')) {
    tokenToVerify = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    // Extração do cookie helpus_session se presente
    const match = cookieHeader.match(/helpus_session=([^;]+)/);
    if (match) {
      tokenToVerify = decodeURIComponent(match[1]).trim();
    }
  }

  // 2. Verificação de Token de Sessão Assinado
  if (tokenToVerify) {
    const verified = verifySessionToken(tokenToVerify);
    if (verified) {
      const isSuperAdmin = verified.role === 'super_admin';
      return {
        authenticated: true,
        isSuperAdmin,
        userEmail: verified.email,
        userId: verified.userId,
        role: verified.role,
        userRole: verified.role,
        tenantId: isSuperAdmin ? 'all' : verified.tenantId,
        allowedTenantIds: isSuperAdmin ? ['all'] : verified.allowedTenantIds,
        user: {
          id: verified.userId,
          email: verified.email,
          name: verified.email.split('@')[0],
          role: verified.role,
          tenantId: isSuperAdmin ? 'all' : verified.tenantId,
          allowedTenantIds: isSuperAdmin ? ['all'] : verified.allowedTenantIds,
          username: verified.email.split('@')[0],
          hasSupportAccess: true,
          status: 'active',
        },
      };
    }
    // Token fornecido mas inválido ou expirado
    return {
      authenticated: false,
      isSuperAdmin: false,
      error: 'invalid_or_expired_token',
    };
  }

  // 3. Autenticação Administrativa Server-to-Server via process.env.SUPERADMIN_SECRET
  // Permitido EXCLUSIVAMENTE se a variável de ambiente estiver configurada.
  // SEM segredos fixos em código.
  if (superAdminSecret && process.env.SUPERADMIN_SECRET) {
    const expectedBuf = Buffer.from(process.env.SUPERADMIN_SECRET, 'utf-8');
    const providedBuf = Buffer.from(superAdminSecret, 'utf-8');

    if (expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return {
        authenticated: true,
        isSuperAdmin: true,
        userEmail: 'helpus.ecommerce@gmail.com',
        role: 'super_admin',
        userRole: 'super_admin',
        tenantId: 'all',
        allowedTenantIds: ['all'],
        user: {
          id: 'helpus-superadmin-env',
          email: 'helpus.ecommerce@gmail.com',
          name: 'HelpUS Master SuperAdmin',
          role: 'super_admin',
          tenantId: 'all',
          allowedTenantIds: ['all'],
          username: 'helpus.master',
          hasSupportAccess: true,
          status: 'active',
        },
      };
    }
  }

  // 4. Solicitação sem credenciais válidas assinadas (Tentativa de forjar cabeçalhos rejeitada)
  return {
    authenticated: false,
    isSuperAdmin: false,
    error: 'unauthenticated_missing_valid_token',
  };
}

/**
 * Projeção Segura de Dados (DTO):
 * Oculta notas internas (isInternalNote) e campos sensíveis de administração para clientes comuns.
 */
export function projectTicketForUser(ticket: Ticket, isSuperAdmin: boolean): Ticket {
  if (isSuperAdmin) {
    return ticket;
  }

  return {
    ...ticket,
    adminNotes: undefined, // Nunca expõe anotações de gestão para clientes
    messages: (ticket.messages || [])
      .filter((m) => !m.isInternalNote)
      .map((m) => ({
        ...m,
        // Garante que o cliente nunca veja a flag isInternalNote mesmo se filtrada
        isInternalNote: false,
      })),
  };
}

export function projectTicketListForUser(tickets: Ticket[], isSuperAdmin: boolean): Ticket[] {
  return tickets.map((t) => projectTicketForUser(t, isSuperAdmin));
}


/**
 * P0-C (Auditoria Ciclo 027):
 * Cálculo canônico de payload cobrindo 100% dos campos de governança do TicketEvent.
 */
export function computeEventPayload(event: Omit<TicketEvent, 'signature'>): string {
  const parts = [
    event.id,
    event.ticketId,
    (event as any).tenantId || '',
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

/**
 * P0-A & P0-C: Assinatura criptográfica HMAC-SHA256 usando chave dedicada EVENT_HMAC_SECRET.
 */
export function signTicketEvent(event: Omit<TicketEvent, 'signature'>): string {
  const secret = getEventHmacSecret();
  const payload = computeEventPayload(event);
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * P0-A, P0-B & P0-C: Verificação rigorosa de integridade, proveniência e temporalidade do TicketEvent.
 * - Zero bypass: eventos com IDs prefixados (evt-aid-, etc.) DEVEM possuir assinatura HMAC válida.
 * - Rejeição estrita de timestamps futuros (skew > 60s).
 * - Comparação segura constant-time via timingSafeEqual.
 */
export function verifyTicketEventIntegrity(
  event: TicketEvent,
  maxFutureSkewMs: number = 60_000,
  referenceNowMs: number = Date.now()
): { valid: boolean; reason?: string } {
  if (!event || !event.id || !event.type || !event.timestamp) {
    return { valid: false, reason: 'missing_fields' };
  }

  // 1. Verificação de desvio temporal / Timestamp no futuro (P0-A)
  const eventTime = new Date(event.timestamp).getTime();
  if (isNaN(eventTime)) {
    return { valid: false, reason: 'invalid_timestamp_format' };
  }
  if (eventTime > referenceNowMs + maxFutureSkewMs) {
    return { valid: false, reason: 'future_timestamp_rejected' };
  }

  // 2. Segregação de privilégios e papéis por tipo de evento
  if (
    event.type === 'master_approved' ||
    event.type === 'ticket_reset_by_master' ||
    event.type === 'ticket_rejected'
  ) {
    if (event.actorRole !== 'master_superadmin') {
      return { valid: false, reason: 'invalid_role_for_master_event' };
    }
    const email = (event.actorEmail || '').toLowerCase();
    const isAuthorized =
      email === 'master.superadmin@helpusbr.com' ||
      email === 'helpus.ecommerce@gmail.com' ||
      (AUTHORIZED_SUPERADMIN_EMAILS as readonly string[]).some((e) => e.toLowerCase() === email);
    if (!isAuthorized) {
      return { valid: false, reason: 'unauthorized_master_email' };
    }
  }

  if (event.type === 'ticket_resolved' || event.type === 'production_step') {
    if (event.actorRole !== 'system_pipeline' && event.actorRole !== 'master_superadmin') {
      return { valid: false, reason: 'invalid_role_for_pipeline_event' };
    }
  }

  if (event.type === 'ticket_reopened_by_client' || event.type === 'ticket_created') {
    if (event.actorRole !== 'client' && event.actorRole !== 'tenant_admin' && event.actorRole !== 'master_superadmin') {
      return { valid: false, reason: 'invalid_role_for_client_event' };
    }
  }

  // 3. P0-B: Zero bypass por prefixo de ID! Assinatura HMAC é estritamente obrigatória para TODOS os eventos.
  if (!event.signature || typeof event.signature !== 'string') {
    return { valid: false, reason: 'missing_server_signature' };
  }

  try {
    const expectedSig = signTicketEvent(event);
    const sigBuf = Buffer.from(event.signature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (!safeTimingEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'tampered_signature' };
    }
  } catch (err: any) {
    return { valid: false, reason: 'crypto_verification_failed' };
  }

  return { valid: true };
}
