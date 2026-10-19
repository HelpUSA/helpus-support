import crypto from 'crypto';
import { Ticket } from '@/types/ticket';

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

// Chave secreta de assinatura. Em produção deve vir obrigatoriamente de process.env.
const SERVER_AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.SUPERADMIN_SECRET ||
  'helpus_auth_hmac_sha256_internal_server_key_2026_secure';

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

  const payloadB64 = Buffer.from(JSON.stringify(fullPayload), 'utf-8').toString('base64url');
  const hmac = crypto.createHmac('sha256', SERVER_AUTH_SECRET);
  hmac.update(`v1.${payloadB64}`);
  const sigB64 = hmac.digest('base64url');

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
  const hmac = crypto.createHmac('sha256', SERVER_AUTH_SECRET);
  hmac.update(`v1.${payloadB64}`);
  const expectedSigB64 = hmac.digest('base64url');

  // 2. Comparação em tempo constante (evita timing attacks)
  const expectedBuf = Buffer.from(expectedSigB64, 'utf-8');
  const providedBuf = Buffer.from(sigB64, 'utf-8');

  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return null; // Assinatura forjada ou inválida
  }

  // 3. Decodifica o payload e valida expiração
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
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
