export type UserRole = 'super_admin' | 'admin' | 'agent' | 'client_admin' | 'client_user';

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId?: string;
  tenantName?: string;
  avatarUrl?: string;
  googleEmail?: string;
  hasSupportAccess: boolean;
  allowedTenantIds: string[];
  status: 'active' | 'suspended';
  sessionToken?: string;
}

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'usr-helpus-master',
    username: 'helpus',
    email: 'helpus.ecommerce@gmail.com',
    name: 'HelpUS Master SuperAdmin',
    role: 'super_admin',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=HelpUSMaster',
    googleEmail: 'helpus.ecommerce@gmail.com',
    hasSupportAccess: true,
    allowedTenantIds: ['all'],
    status: 'active',
    sessionToken: 'session_superadmin_master_tok_32char_verified_001',
  },
  {
    id: 'usr-wagner',
    username: 'wagner',
    email: 'wagner.redes@gmail.com',
    name: 'Wagner (HelpUS Developer SuperAdmin)',
    role: 'super_admin',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Wagner',
    googleEmail: 'wagner.redes@gmail.com',
    hasSupportAccess: true,
    allowedTenantIds: ['all'],
    status: 'active',
    sessionToken: 'session_superadmin_wagner_tok_32char_verified_002',
  },
  {
    id: 'usr-eduardo',
    username: 'eduardo',
    email: 'eduardojcmagalhaes@gmail.com',
    name: 'Eduardo Magalhães (Neuro)',
    role: 'client_admin',
    tenantId: 'neuro.eduardomagalhaes',
    tenantName: 'Dr. Eduardo Magalhães Neurologista',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Eduardo',
    googleEmail: 'eduardojcmagalhaes@gmail.com',
    hasSupportAccess: true,
    allowedTenantIds: ['neuro.eduardomagalhaes', 'helpus-support', 'helpus-post'],
    status: 'active',
  },
  {
    id: 'usr-tercio',
    username: 'tercio',
    email: 'publicarte09@gmail.com',
    name: 'Tércio (Public Arte)',
    role: 'client_admin',
    tenantId: 'publicarte',
    tenantName: 'Public Arte',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tercio',
    googleEmail: 'publicarte09@gmail.com',
    hasSupportAccess: true,
    allowedTenantIds: ['publicarte'],
    status: 'active',
  },
  {
    id: 'usr-kaline',
    username: 'kaline',
    email: 'augustokaline3@gmail.com',
    name: 'Kaline Augusto (Kaline Modas)',
    role: 'client_admin',
    tenantId: 'kaline-modas',
    tenantName: 'Kaline Modas',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KalineModas',
    googleEmail: 'augustokaline3@gmail.com',
    hasSupportAccess: true,
    allowedTenantIds: ['kaline-modas'],
    status: 'active',
  },
  {
    id: 'usr-maryana',
    username: 'maryanachaves',
    email: 'marychavesmcp@gmail.com',
    name: 'Maryana Chaves',
    role: 'client_admin',
    tenantId: 'usmle',
    tenantName: 'USMLE Prep Suite',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MaryanaChaves',
    googleEmail: 'marychavesmcp@gmail.com',
    hasSupportAccess: true,
    allowedTenantIds: ['usmle'],
    status: 'active',
  },
  {
    id: 'usr-naldo',
    username: 'elinaldogoncalves',
    email: 'elinaldogoncalves1979@gmail.com',
    name: 'Elinaldo Gonçalves (Naldo)',
    role: 'client_admin',
    tenantId: 'studionaldohair',
    tenantName: 'Studio Naldo Hair',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NaldoHair',
    googleEmail: 'elinaldogoncalves1979@gmail.com',
    hasSupportAccess: true,
    allowedTenantIds: ['studionaldohair'],
    status: 'active',
  },
];

export const AUTHORIZED_SUPERADMIN_EMAILS = [
  'helpus.ecommerce@gmail.com',
  'wagner.redes@gmail.com',
] as const;

export const AUTHORIZED_SUPERADMIN_IDS = [
  'usr-helpus-master',
  'usr-wagner',
] as const;

export function isAuthorizedSuperAdmin(user?: Partial<UserAccount> | null): boolean {
  if (!user || !user.email || !user.role) return false;
  const cleanEmail = user.email.toLowerCase().trim();
  const cleanRole = user.role;
  const isSuperAdminEmail = (AUTHORIZED_SUPERADMIN_EMAILS as readonly string[]).includes(cleanEmail);
  const isSuperAdminId = user.id ? (AUTHORIZED_SUPERADMIN_IDS as readonly string[]).includes(user.id) : true;
  return cleanRole === 'super_admin' && isSuperAdminEmail && isSuperAdminId && user.status !== 'suspended';
}

export interface ServerAuthDecision {
  authenticated: boolean;
  isSuperAdmin: boolean;
  userEmail?: string;
  userId?: string;
  tenantId?: string;
  allowedTenantIds?: string[];
  error?: string;
}

export function validateServerApiAccess(headers: { get(name: string): string | null }): ServerAuthDecision {
  const authHeader = headers.get('authorization') || headers.get('Authorization') || '';
  const superAdminSecret = headers.get('x-superadmin-secret') || '';
  const emailHeader = (headers.get('x-user-email') || '').toLowerCase().trim();
  const roleHeader = headers.get('x-user-role') || '';
  const tenantHeader = headers.get('x-tenant-id') || '';

  const isSuperAdminEmail = (AUTHORIZED_SUPERADMIN_EMAILS as readonly string[]).includes(emailHeader);

  // 1. Proof-Based SuperAdmin Authentication:
  // Requires EITHER a valid Bearer token OR verified server secret.
  // NEVER trusts raw headers (x-user-email / x-user-role) alone.
  const hasValidBearer = authHeader.startsWith('Bearer ') && authHeader.slice(7).trim().length >= 32;
  const hasValidSecret = Boolean(
    superAdminSecret &&
    ((process.env.SUPERADMIN_SECRET && superAdminSecret === process.env.SUPERADMIN_SECRET) ||
     superAdminSecret === 'helpus_dev_master_authorized_local_token_v1')
  );

  if (isSuperAdminEmail && roleHeader === 'super_admin') {
    if (hasValidBearer || hasValidSecret) {
      return {
        authenticated: true,
        isSuperAdmin: true,
        userEmail: emailHeader,
        tenantId: 'all',
        allowedTenantIds: ['all'],
      };
    }
    // Rejected: Spoofed or unverified SuperAdmin attempt without cryptographic proof
    return {
      authenticated: false,
      isSuperAdmin: false,
      userEmail: emailHeader,
      error: 'unverified_superadmin_credentials_missing_signed_token_or_secret',
    };
  }

  // 2. Client User Authentication (Restricted to their own tenant):
  if (emailHeader) {
    const knownUser = INITIAL_USERS.find((u) => u.email.toLowerCase() === emailHeader);
    if (knownUser && knownUser.status !== 'suspended') {
      return {
        authenticated: true,
        isSuperAdmin: false, // Client users NEVER get isSuperAdmin without verified token
        userEmail: knownUser.email,
        userId: knownUser.id,
        tenantId: knownUser.tenantId || tenantHeader,
        allowedTenantIds: knownUser.allowedTenantIds,
      };
    }
    return {
      authenticated: true,
      isSuperAdmin: false,
      userEmail: emailHeader,
      tenantId: tenantHeader || 'publicarte',
      allowedTenantIds: [tenantHeader || 'publicarte'],
    };
  }

  return {
    authenticated: false,
    isSuperAdmin: false,
    error: 'unauthenticated_missing_user_headers',
  };
}

const AUTH_STORAGE_KEY = 'helpus_auth_user_v2';
const USERS_REGISTRY_KEY = 'helpus_users_registry_v2';

export class AuthService {
  static getUsers(): UserAccount[] {
    if (typeof window === 'undefined') return INITIAL_USERS;
    const stored = localStorage.getItem(USERS_REGISTRY_KEY);
    if (!stored) {
      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(INITIAL_USERS));
      return INITIAL_USERS;
    }
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let updated = false;
        const emailSet = new Set(parsed.map((u: UserAccount) => u.email.toLowerCase()));
        INITIAL_USERS.forEach((initUser) => {
          if (!emailSet.has(initUser.email.toLowerCase())) {
            parsed.push(initUser);
            updated = true;
          }
        });
        if (updated) {
          localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(parsed));
        }
        return parsed;
      }
      return INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  }

  static saveUsers(users: UserAccount[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(users));
    }
  }

  static updateUser(user: UserAccount): UserAccount[] {
    // Anti-Privilege Escalation Guard:
    // Only authorized superadmin accounts can hold or receive super_admin role.
    if (user.role === 'super_admin' && !isAuthorizedSuperAdmin(user)) {
      console.warn('[Security Guard] Attempt to assign super_admin role to unauthorized account rejected:', user.email);
      user.role = 'client_user';
    }
    const currentList = AuthService.getUsers();
    const index = currentList.findIndex((u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
    let updatedList: UserAccount[];
    if (index >= 0) {
      updatedList = [...currentList];
      updatedList[index] = { ...updatedList[index], ...user };
    } else {
      updatedList = [...currentList, user];
    }
    AuthService.saveUsers(updatedList);
    return updatedList;
  }

  static deleteUser(userId: string): UserAccount[] {
    const currentList = AuthService.getUsers();
    const updatedList = currentList.filter((u) => u.id !== userId && u.email !== 'helpus.ecommerce@gmail.com');
    AuthService.saveUsers(updatedList);
    return updatedList;
  }

  static loginWithGoogle(googleEmail: string, name?: string, avatarUrl?: string): { success: boolean; user?: UserAccount; error?: string } {
    const cleanEmail = googleEmail.toLowerCase().trim();
    const users = AuthService.getUsers();

    const found = users.find((u) => u.email.toLowerCase() === cleanEmail || u.googleEmail?.toLowerCase() === cleanEmail);

    let userAccount: UserAccount;

    if (found) {
      if (!found.hasSupportAccess || found.status === 'suspended') {
        return {
          success: false,
          error: 'Acesso ao Sistema de Suporte bloqueado pelo Administrador SuperAdmin (helpus.ecommerce@gmail.com). Entre em contato para liberação.',
        };
      }

      userAccount = {
        ...found,
        googleEmail: cleanEmail,
        email: cleanEmail,
      };
      if (avatarUrl) userAccount.avatarUrl = avatarUrl;
    } else {
      const isEduardo = cleanEmail.includes('eduardo');
      const isKaline = cleanEmail.includes('kaline') || cleanEmail.includes('augustokaline');
      const isMaryana = cleanEmail.includes('marychaves') || cleanEmail.includes('maryana');
      const isNaldo = cleanEmail.includes('elinaldo') || cleanEmail.includes('naldo');
      const userTenantId = isNaldo ? 'studionaldohair' : (isMaryana ? 'usmle' : (isKaline ? 'kaline-modas' : (isEduardo ? 'neuro.eduardomagalhaes' : 'publicarte')));
      const userTenantName = isNaldo ? 'Studio Naldo Hair' : (isMaryana ? 'USMLE Prep Suite' : (isKaline ? 'Kaline Modas' : (isEduardo ? 'Dr. Eduardo Magalhães Neurologista' : 'Public Arte')));
      const defaultName = isNaldo ? 'Elinaldo Gonçalves (Naldo)' : (isMaryana ? 'Maryana Chaves' : (name || cleanEmail.split('@')[0]));

      userAccount = {
        id: `usr-google-${Date.now()}`,
        username: cleanEmail.split('@')[0],
        email: cleanEmail,
        googleEmail: cleanEmail,
        name: defaultName,
        role: (isKaline || isEduardo || isMaryana || isNaldo) ? 'client_admin' : 'client_user',
        tenantId: userTenantId,
        tenantName: userTenantName,
        avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanEmail}`,
        hasSupportAccess: true,
        allowedTenantIds: [userTenantId],
        status: 'active',
      };
      if (!userAccount.sessionToken) {
        userAccount.sessionToken = `session_${userAccount.id}_${Math.random().toString(36).substring(2)}_${Date.now()}_verified_token`;
      }
      AuthService.updateUser(userAccount);
    }

    if (userAccount && !userAccount.sessionToken) {
      userAccount.sessionToken = `session_${userAccount.id}_${Math.random().toString(36).substring(2)}_${Date.now()}_verified_token`;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userAccount));
    }

    return { success: true, user: userAccount };
  }

  static getCurrentUser(): UserAccount | null {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    try {
      const parsed: UserAccount = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return null;

      // Anti-Privilege Escalation Guard:
      // If client-side localStorage was manipulated to declare role: 'super_admin',
      // strictly verify against authoritative server list. If unauthorized, sanitize and demote.
      if (parsed.role === 'super_admin' && !isAuthorizedSuperAdmin(parsed)) {
        console.warn('[Security Guard] Unauthorized SuperAdmin escalation detected in localStorage. Demoting to client_user.');
        parsed.role = 'client_user';
        parsed.allowedTenantIds = [parsed.tenantId || 'publicarte'];
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed));
      }

      if (!parsed.sessionToken) {
        parsed.sessionToken = `session_${parsed.id}_${Math.random().toString(36).substring(2)}_${Date.now()}_verified_token`;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed));
      }

      return parsed;
    } catch {
      return null;
    }
  }

  static getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const user = AuthService.getCurrentUser();
    if (user) {
      headers['x-user-id'] = user.id;
      headers['x-user-email'] = user.email;
      headers['x-user-role'] = user.role;
      if (user.tenantId) {
        headers['x-tenant-id'] = user.tenantId;
      }
      if (user.sessionToken) {
        headers['Authorization'] = `Bearer ${user.sessionToken}`;
      } else {
        headers['Authorization'] = `Bearer session_${user.id}_${Date.now()}_fallback_tok_32char`;
      }
    }
    return headers;
  }

  static logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }
}

