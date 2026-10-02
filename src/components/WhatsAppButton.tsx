'use client';

import React, { useState } from 'react';
import { MessageCircle, X, ExternalLink, ShieldCheck } from 'lucide-react';
import { Translations } from '@/lib/i18n';

interface WhatsAppButtonProps {
  t: Translations['whatsapp'];
  phoneNumber?: string;
}

export default function WhatsAppButton({
  t,
  phoneNumber = '5583999999999',
}: WhatsAppButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenWhatsApp = () => {
    const text = encodeURIComponent('Olá equipe HelpUS! Preciso de atendimento para minha empresa.');
    window.open(`https://wa.me/${phoneNumber}?text=${text}`, '_blank');
  };

  return (
    <div className="fixed bottom-6 left-6 z-[9990] font-sans">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title={t.tooltip}
          className="flex items-center gap-2.5 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border border-emerald-400/30 group"
        >
          <div className="relative">
            <MessageCircle className="w-5 h-5 text-white" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-300 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-300 rounded-full" />
          </div>
          <span className="font-medium text-xs tracking-wide">WhatsApp Direct</span>
        </button>
      )}

      {isOpen && (
        <div className="w-[320px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-4 space-y-3 animate-in fade-in slide-in-from-bottom-3 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-white">{t.title}</h4>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Suporte Oficial HelpUS
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{t.desc}</p>

          <button
            onClick={handleOpenWhatsApp}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            {t.button}
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
