'use client';

import React, { useState } from 'react';
import { X, ShieldCheck, AlertCircle, Lock } from 'lucide-react';
import { AuthService, UserAccount } from '@/lib/auth';
import { Translations } from '@/lib/i18n';
import { useGoogleAuth, GoogleLoginButton } from '@/shared/googleAuth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessLogin: (user: UserAccount) => void;
  t: Translations['auth'];
}

export default function AuthModal({ isOpen, onClose, onSuccessLogin, t }: AuthModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  // Universal Google Auth Hook (@shared/googleAuth - Padrão Kaline Modas)
  const {
    login: triggerGoogleAuthLogin,
    isLoading: isGoogleLoading,
    error: googleAuthError,
    clearError: clearGoogleAuthError
  } = useGoogleAuth({
    clientId: '812202824664-s716306ibb7c15jh7aok2v0lfnuocpkn.apps.googleusercontent.com',
    storageKey: 'helpus_auth_user_v2',
    onSuccess: (googleUser: any) => {
      setError(null);
      const res = AuthService.loginWithGoogle(googleUser.email, googleUser.name, googleUser.picture);
      if (res.success && res.user) {
        onSuccessLogin(res.user);
        onClose();
      } else {
        setError(res.error || 'Acesso bloqueado pelo Administrador.');
      }
    },
    onError: (errMsg: string) => {
      setError(errMsg);
    }
  });

  const handleGoogleLoginButtonClick = () => {
    setError(null);
    setCaptchaError(null);
    clearGoogleAuthError();

    if (!isCaptchaVerified) {
      alert('Por favor, marque a caixa "Não sou um robô" para continuar com o login.');
      return;
    }

    triggerGoogleAuthLogin();
  };

  const displayError = error || googleAuthError || captchaError;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl p-8 text-center space-y-6 relative overflow-hidden text-slate-100">
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Ícone de Cabeçalho Padronizado */}
        <div className="inline-flex p-4 rounded-full bg-indigo-950/50 border border-indigo-500/30 text-indigo-400 mb-1 shadow-lg shadow-indigo-900/30">
          <Lock className="w-8 h-8 text-indigo-400" />
        </div>

        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">PAINEL DE LOGIN</h1>
          <h2 className="text-sm font-bold text-indigo-400 uppercase mt-0.5 tracking-wider">HELPUS SUPPORT SAAS HUB</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Autenticação 100% oficial via Google OAuth para clientes e administradores.
          </p>
        </div>

        {/* Mensagem de Erro */}
        {displayError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-2xl font-bold flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{displayError}</span>
          </div>
        )}

        {/* Widget de Captcha "Não sou um robô" (Padrão Kaline Modas) */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between my-2 text-left shadow-inner">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isCaptchaVerified}
              onChange={(e) => {
                setIsCaptchaVerified(e.target.checked);
                if (e.target.checked) setCaptchaError(null);
              }}
              className="w-5 h-5 accent-indigo-600 rounded border-slate-700 cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-200">Não sou um robô</span>
          </label>
          <div className="flex flex-col items-end text-[10px] text-slate-500">
            <ShieldCheck className="w-5 h-5 text-indigo-500 mb-0.5" />
            <span>reCAPTCHA</span>
          </div>
        </div>

        {/* Botão Oficial de Login do Google (GoogleLoginButton @shared/googleAuth) */}
        <div className="pt-1">
          <GoogleLoginButton
            onClick={handleGoogleLoginButtonClick}
            isLoading={isGoogleLoading}
            disabled={!isCaptchaVerified || isGoogleLoading}
            label="ENTRAR COM O GOOGLE"
            variant="dark"
            className={!isCaptchaVerified ? 'opacity-50 cursor-not-allowed' : ''}
          />
        </div>

        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-[11px] text-slate-400 leading-relaxed text-center w-full">
          🔒 Autenticação 100% oficial via Google OAuth no Ecossistema HelpUS.
        </div>
      </div>
    </div>
  );
}
