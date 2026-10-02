'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, CheckCircle2 } from 'lucide-react';
import { Language, DICTIONARY } from '@/lib/i18n';

interface CookieConsentProps {
  lang: Language;
  onOpenPrivacy: () => void;
}

export default function CookieConsent({ lang, onOpenPrivacy }: CookieConsentProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('helpus_cookie_consent_v1');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('helpus_cookie_consent_v1', 'accepted');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const labels = {
    pt: {
      text: 'Utilizamos cookies essenciais e tecnologias para garantir a segurança da sessão, isolamento multi-tenant e a melhor experiência de suporte.',
      accept: 'Aceitar Todos',
      privacy: 'Política de Privacidade',
    },
    en: {
      text: 'We use essential cookies and technologies to guarantee session security, multi-tenant isolation, and the best support experience.',
      accept: 'Accept All',
      privacy: 'Privacy Policy',
    },
    es: {
      text: 'Utilizamos cookies esenciales y tecnologías para garantizar la seguridad de la sesión, el aislamiento multi-tenant y la mejor experiencia.',
      accept: 'Aceptar Todos',
      privacy: 'Política de Privacidad',
    },
  }[lang];

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-[9995] bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl p-4 text-xs text-slate-200 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-2 flex-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-xs">Aviso de Cookies & LGPD</span>
            <button onClick={() => setIsVisible(false)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-slate-300 leading-relaxed text-[11px]">{labels.text}</p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleAccept}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-[11px] shadow-md transition-all flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {labels.accept}
            </button>
            <button
              onClick={onOpenPrivacy}
              className="text-slate-400 hover:text-indigo-400 underline text-[11px] transition-colors"
            >
              {labels.privacy}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
