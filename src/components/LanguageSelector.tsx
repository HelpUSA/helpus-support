'use client';

import React from 'react';
import { Globe } from 'lucide-react';
import { Language } from '@/lib/i18n';

interface LanguageSelectorProps {
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
}

export default function LanguageSelector({ currentLang, onLanguageChange }: LanguageSelectorProps) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 text-xs">
      <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      <button
        onClick={() => onLanguageChange('pt')}
        className={`px-1.5 py-0.5 rounded transition-colors font-medium ${
          currentLang === 'pt' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
        }`}
      >
        PT
      </button>
      <span className="text-slate-700">|</span>
      <button
        onClick={() => onLanguageChange('en')}
        className={`px-1.5 py-0.5 rounded transition-colors font-medium ${
          currentLang === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
        }`}
      >
        EN
      </button>
      <span className="text-slate-700">|</span>
      <button
        onClick={() => onLanguageChange('es')}
        className={`px-1.5 py-0.5 rounded transition-colors font-medium ${
          currentLang === 'es' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
        }`}
      >
        ES
      </button>
    </div>
  );
}
