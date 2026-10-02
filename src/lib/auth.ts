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
  },
  {
    id: 'usr-eduardo',
    username: 'eduardo',
    email: 'eduardojcmagalhaes@gmail.com',
    name: 'Eduardo Magalhães (Neuro)',
    role: 'admin',
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
];

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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
      const userTenantId = isKaline ? 'kaline-modas' : (isEduardo ? 'neuro.eduardomagalhaes' : 'publicarte');
      const userTenantName = isKaline ? 'Kaline Modas' : (isEduardo ? 'Dr. Eduardo Magalhães Neurologista' : 'Public Arte');

      userAccount = {
        id: `usr-google-${Date.now()}`,
        username: cleanEmail.split('@')[0],
        email: cleanEmail,
        googleEmail: cleanEmail,
        name: name || cleanEmail.split('@')[0],
        role: (isKaline || isEduardo) ? 'client_admin' : 'client_user',
        tenantId: userTenantId,
        tenantName: userTenantName,
        avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanEmail}`,
        hasSupportAccess: true,
        allowedTenantIds: [userTenantId],
        status: 'active',
      };
      AuthService.updateUser(userAccount);
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
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  static logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }
}

