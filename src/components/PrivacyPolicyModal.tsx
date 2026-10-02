'use client';

import React from 'react';
import { X, ShieldCheck, Lock, FileText } from 'lucide-react';
import { Language } from '@/lib/i18n';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export default function PrivacyPolicyModal({ isOpen, onClose, lang }: PrivacyPolicyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">Política de Privacidade & Proteção de Dados (LGPD)</h2>
              <p className="text-[11px] text-slate-400">HelpUS Support Hub • support.helpusbr.com</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-slate-300 leading-relaxed">
          <section className="space-y-1.5">
            <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-emerald-400" /> 1. Coleta e Isolamento Multi-Tenant
            </h3>
            <p>
              O HelpUS Support Hub armazena estritamente as informações necessárias para prestação de suporte técnico e resolução de chamados. Cada empresa parceira (tenant) possui isolamento lógico completo de dados via identificadores únicos.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-400" /> 2. Dados de Contexto Anexados aos Chamados
            </h3>
            <p>
              Ao abrir um chamado por meio do Widget de Suporte, capturamos automaticamente:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-2">
              <li>URL da página web onde o chamado foi originado;</li>
              <li>Dados básicos do usuário logado (Nome e E-mail fornecidos pelo sistema cliente);</li>
              <li>Sistema operacional e navegador para diagnóstico de erros técnicos;</li>
              <li>Capturas de tela e anexos inseridos diretamente pelo usuário.</li>
            </ul>
          </section>

          <section className="space-y-1.5">
            <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-400" /> 3. Notificações e Segurança
            </h3>
            <p>
              Os dados de contato (WhatsApp e E-mail) fornecidos são utilizados exclusivamente para envio de alertas automatizados de progresso dos chamados e respostas de atendimento. Não compartilhamos informações com terceiros.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Entendido e De Acordo
          </button>
        </div>
      </div>
    </div>
  );
}
