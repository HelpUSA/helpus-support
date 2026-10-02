import React from 'react';

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  locale?: string;
  loginTime?: number;
}

export interface UseGoogleAuthOptions {
  clientId?: string;
  allowedEmails?: string[] | null;
  onSuccess?: (user: GoogleUser) => void;
  onError?: (errorMessage: string, rawUser?: any) => void;
  storageKey?: string;
}

export interface UseGoogleAuthReturn {
  user: GoogleUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string;
  login: () => void;
  logout: () => void;
  clearError: () => void;
}

export function useGoogleAuth(options?: UseGoogleAuthOptions): UseGoogleAuthReturn;

export interface GoogleLoginButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  isLoading?: boolean;
  disabled?: boolean;
  label?: string;
  variant?: 'dark' | 'light' | 'glass';
  className?: string;
}

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps>;
