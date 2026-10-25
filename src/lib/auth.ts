import {
  signSessionToken,
  verifySessionToken,
  validateServerApiAccess,
  projectTicketForUser,
  projectTicketListForUser,
  AUTHORIZED_SUPERADMIN_EMAILS,
  UserRole,
} from './serverAuth';

export {
  signSessionToken,
  verifySessionToken,
  validateServerApiAccess,
  projectTicketForUser,
  projectTicketListForUser,
  AUTHORIZED_SUPERADMIN_EMAILS,
};
export type { UserRole };

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
    sessionToken: signSessionToken({
      userId: 'usr-helpus-master',
      email: 'helpus.ecommerce@gmail.com',
      role: 'super_admin',
      tenantId: 'all',
      allowedTenantIds: ['all'],
    }),
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
    sessionToken: signSessionToken({
      userId: 'usr-wagner',
      email: 'wagner.redes@gmail.com',
      role: 'super_admin',
      tenantId: 'all',
      allowedTenantIds: ['all'],
    }),
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
    sessionToken: signSessionToken({
      userId: 'usr-eduardo',
      email: 'eduardojcmagalhaes@gmail.com',
      role: 'client_admin',
      tenantId: 'neuro.eduardomagalhaes',
      allowedTenantIds: ['neuro.eduardomagalhaes', 'helpus-support', 'helpus-post'],
    }),
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
    sessionToken: signSessionToken({
      userId: 'usr-tercio',
      email: 'publicarte09@gmail.com',
      role: 'client_admin',
      tenantId: 'publicarte',
      allowedTenantIds: ['publicarte'],
    }),
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
    sessionToken: signSessionToken({
      userId: 'usr-kaline',
      email: 'augustokaline3@gmail.com',
      role: 'client_admin',
      tenantId: 'kaline-modas',
      allowedTenantIds: ['kaline-modas'],
    }),
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
    sessionToken: signSessionToken({
      userId: 'usr-maryana',
      email: 'marychavesmcp@gmail.com',
      role: 'client_admin',
      tenantId: 'usmle',
      allowedTenantIds: ['usmle'],
    }),
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
    sessionToken: signSessionToken({
      userId: 'usr-naldo',
      email: 'elinaldogoncalves1979@gmail.com',
      role: 'client_admin',
      tenantId: 'studionaldohair',
      allowedTenantIds: ['studionaldohair'],
    }),
  },
  {
    id: 'usr-alex',
    username: 'dralexgomes',
    email: 'dralexgomes@gmail.com',
    name: 'Dr. Alexander Gomes',
    role: 'client_user',
    tenantId: 'aidoctor',
    tenantName: 'AIDoctor',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=DrAlexanderGomes',
    googleEmail: 'dralexgomes@gmail.com',
    hasSupportAccess: true,
    allowedTenantIds: ['aidoctor'],
    status: 'active',
    sessionToken: signSessionToken({
      userId: 'usr-alex',
      email: 'dralexgomes@gmail.com',
      role: 'client_user',
      tenantId: 'aidoctor',
      allowedTenantIds: ['aidoctor'],
    }),
  },
];

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
          const existing = parsed.find((u: UserAccount) => u.email.toLowerCase() === initUser.email.toLowerCase());
          if (!existing) {
            parsed.push(initUser);
            updated = true;
          } else if (initUser.email.toLowerCase() === 'dralexgomes@gmail.com') {
            if (existing.role !== 'client_user' || existing.name !== initUser.name) {
              existing.role = 'client_user';
              existing.name = initUser.name;
              existing.sessionToken = initUser.sessionToken;
              updated = true;
            }
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

      const isAlex = cleanEmail.includes('dralex') || cleanEmail.includes('alexgomes');
      userAccount = {
        ...found,
        role: isAlex ? 'client_user' : found.role,
        name: isAlex ? 'Dr. Alexander Gomes' : found.name,
        googleEmail: cleanEmail,
        email: cleanEmail,
      };
      if (avatarUrl) userAccount.avatarUrl = avatarUrl;
    } else {
      const isEduardo = cleanEmail.includes('eduardo');
      const isKaline = cleanEmail.includes('kaline') || cleanEmail.includes('augustokaline');
      const isMaryana = cleanEmail.includes('marychaves') || cleanEmail.includes('maryana');
      const isNaldo = cleanEmail.includes('elinaldo') || cleanEmail.includes('naldo');
      const isAlex = cleanEmail.includes('dralex') || cleanEmail.includes('alexgomes');
      const userTenantId = isAlex ? 'aidoctor' : (isNaldo ? 'studionaldohair' : (isMaryana ? 'usmle' : (isKaline ? 'kaline-modas' : (isEduardo ? 'neuro.eduardomagalhaes' : 'publicarte'))));
      const userTenantName = isAlex ? 'AIDoctor' : (isNaldo ? 'Studio Naldo Hair' : (isMaryana ? 'USMLE Prep Suite' : (isKaline ? 'Kaline Modas' : (isEduardo ? 'Dr. Eduardo Magalhães Neurologista' : 'Public Arte'))));
      const defaultName = isAlex ? 'Dr. Alexander Gomes' : (isNaldo ? 'Elinaldo Gonçalves (Naldo)' : (isMaryana ? 'Maryana Chaves' : (name || cleanEmail.split('@')[0])));

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
      if (!userAccount.sessionToken || !verifySessionToken(userAccount.sessionToken)) {
        userAccount.sessionToken = signSessionToken({
          userId: userAccount.id,
          email: userAccount.email,
          role: userAccount.role,
          tenantId: userAccount.tenantId || 'publicarte',
          allowedTenantIds: userAccount.allowedTenantIds || [userAccount.tenantId || 'publicarte'],
        });
      }
      AuthService.updateUser(userAccount);
    }

    if (userAccount && (!userAccount.sessionToken || !verifySessionToken(userAccount.sessionToken))) {
      userAccount.sessionToken = signSessionToken({
        userId: userAccount.id,
        email: userAccount.email,
        role: userAccount.role,
        tenantId: userAccount.tenantId || 'publicarte',
        allowedTenantIds: userAccount.allowedTenantIds || [userAccount.tenantId || 'publicarte'],
      });
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

      if (!parsed.sessionToken || !verifySessionToken(parsed.sessionToken)) {
        parsed.sessionToken = signSessionToken({
          userId: parsed.id,
          email: parsed.email,
          role: parsed.role,
          tenantId: parsed.tenantId || 'publicarte',
          allowedTenantIds: parsed.allowedTenantIds || [parsed.tenantId || 'publicarte'],
        });
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
    if (user && user.sessionToken) {
      headers['Authorization'] = `Bearer ${user.sessionToken}`;
    }
    return headers;
  }

  static logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }
}

