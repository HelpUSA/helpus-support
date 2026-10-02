'use client';

import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, AlertCircle, CheckCircle2, Lock, RefreshCw } from 'lucide-react';
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

  // Captcha State
  const [captchaNum1, setCaptchaNum1] = useState(4);
  const [captchaNum2, setCaptchaNum2] = useState(3);
  const [captchaInput, setCaptchaInput] = useState('');
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [isCaptchaChecked, setIsCaptchaChecked] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  // Universal Google Auth Hook (@shared/googleAuth - STANDARDS.md Section 4)
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

  useEffect(() => {
    if (isOpen) {
      generateCaptcha();
    }
  }, [isOpen]);

  const generateCaptcha = () => {
    const n1 = Math.floor(Math.random() * 8) + 2;
    const n2 = Math.floor(Math.random() * 8) + 1;
    setCaptchaNum1(n1);
    setCaptchaNum2(n2);
    setCaptchaInput('');
    setIsCaptchaVerified(false);
    setIsCaptchaChecked(false);
    setCaptchaError(null);
    setError(null);
    clearGoogleAuthError();
  };

  const handleVerifyCaptcha = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const expected = captchaNum1 + captchaNum2;
    if (parseInt(captchaInput.trim(), 10) === expected && isCaptchaChecked) {
      setIsCaptchaVerified(true);
      setCaptchaError(null);
    } else if (!isCaptchaChecked) {
      setCaptchaError('Por favor, marque a caixinha "Não sou um robô".');
    } else {
      setCaptchaError(`Resultado incorreto. Quanto é ${captchaNum1} + ${captchaNum2}?`);
    }
  };

  const handleGoogleLoginButtonClick = () => {
    setError(null);
    setCaptchaError(null);

    if (!isCaptchaVerified) {
      setCaptchaError('Por favor, conclua a verificação de segurança "Não sou um robô" (CAPTCHA) acima antes de entrar com a conta do Google.');
      return;
    }

    triggerGoogleAuthLogin();
  };

  const displayError = error || googleAuthError;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm leading-tight">Entrar com a Conta Google</h3>
              <p className="text-[11px] text-indigo-200">HelpUS Support SaaS Hub</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {displayError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          {/* Captcha Security Verification Section */}
          <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-indigo-400" />
                <span>1. Verificação de Segurança (Anti-Bot)</span>
              </span>
              <button
                type="button"
                onClick={generateCaptcha}
                title="Gerar novo código"
                className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Gerar Novo
              </button>
            </div>

            {!isCaptchaVerified ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    id="captcha-check"
                    checked={isCaptchaChecked}
                    onChange={(e) => setIsCaptchaChecked(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                  <label htmlFor="captcha-check" className="text-xs text-slate-300 font-medium cursor-pointer select-none">
                    Não sou um robô
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <div className="px-3 py-2 bg-indigo-950/80 border border-indigo-500/30 rounded-xl text-indigo-300 font-mono text-xs font-bold shrink-0">
                    {captchaNum1} + {captchaNum2} = ?
                  </div>
                  <input
                    type="number"
                    placeholder="Resultado"
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleVerifyCaptcha()}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shrink-0"
                  >
                    Confirmar
                  </button>
                </div>

                {captchaError && (
                  <p className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{captchaError}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Captcha Verificado com Sucesso! Login liberado.</span>
              </div>
            )}
          </div>

          {/* Main Single Google Login Button (STANDARDS.md Section 4) */}
          <div className="space-y-4 flex flex-col items-center">
            <GoogleLoginButton
              onClick={handleGoogleLoginButtonClick}
              isLoading={isGoogleLoading}
              disabled={!isCaptchaVerified}
              label={isCaptchaVerified ? 'Entrar com a Conta Google' : '🔒 Resolva o Captcha para Entrar'}
              variant="light"
              className={!isCaptchaVerified ? 'opacity-60 cursor-not-allowed' : ''}
            />

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-[11px] text-slate-400 leading-relaxed text-center w-full">
              🔒 Autenticação 100% oficial via Google OAuth no Ecossistema HelpUS.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
