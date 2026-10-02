'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Sparkles,
  Globe,
  Code,
  CheckCircle2,
  Kanban,
  Lock,
  User,
  ChevronRight,
  Cpu,
  FileText,
} from 'lucide-react';
import LanguageSelector from '@/components/LanguageSelector';
import AuthModal from '@/components/AuthModal';
import CookieConsent from '@/components/CookieConsent';
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';
import { DICTIONARY, Language } from '@/lib/i18n';
import { AuthService, UserAccount } from '@/lib/auth';

export default function LandingPage() {
  const [lang, setLang] = useState<Language>('pt');
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  const t = DICTIONARY[lang];

  useEffect(() => {
    const user = AuthService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  const handleSuccessLogin = (user: UserAccount) => {
    setCurrentUser(user);
    window.location.href = '/portal';
  };

  const handleLogout = () => {
    AuthService.logout();
    setCurrentUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header */}
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand with Official Logo Image */}
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/helpus-logo.jpg"
              alt="HelpUS Logo"
              className="w-10 h-10 rounded-full object-cover border-2 border-indigo-500/50 shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">HelpUS Support</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                  SaaS Hub
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">support.helpusbr.com</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
            <a href="#recursos" className="hover:text-indigo-400 transition-colors">
              {t.nav.features}
            </a>
          </nav>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            <LanguageSelector currentLang={lang} onLanguageChange={setLang} />

            {currentUser ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 font-medium hidden sm:inline">
                  Olá, <strong className="text-indigo-400">{currentUser.name}</strong>
                </span>
                {currentUser.role === 'admin' || currentUser.role === 'super_admin' ? (
                  <Link
                    href="/portal"
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Kanban className="w-3.5 h-3.5" /> Painel Master
                  </Link>
                ) : (
                  <Link
                    href="/portal"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all flex items-center gap-1.5"
                  >
                    <User className="w-3.5 h-3.5" /> Portal ({currentUser.tenantName || 'Cliente'})
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  Sair
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" /> {t.nav.clientArea}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center space-y-8 overflow-hidden">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{t.hero.badge}</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
          {t.hero.title}
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          {t.hero.subtitle}
        </p>

        {/* Autonomous Cloud Processing Note */}
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl max-w-xl mx-auto text-xs text-indigo-200 flex items-center justify-center gap-2">
          <Cpu className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>⚡ <strong>Processamento Autônomo em Nuvem:</strong> Os chamados são resolvidos 24/7 na nuvem. Seu computador NÃO precisa ficar ligado!</span>
        </div>

        {/* Hero CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/25 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 text-sm cursor-pointer"
          >
            <User className="w-4 h-4" />
            {t.hero.clientAreaBtn}
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto pt-12 text-left">
          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-1">
            <div className="text-2xl font-black text-indigo-400">100% Multi-Tenant</div>
            <div className="text-xs text-slate-400 font-medium">{t.hero.statClients}</div>
          </div>
          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-1">
            <div className="text-2xl font-black text-purple-400">PDF & Relatórios</div>
            <div className="text-xs text-slate-400 font-medium">Relatório Automático</div>
          </div>
          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-1">
            <div className="text-2xl font-black text-emerald-400">Nuvem 24/7</div>
            <div className="text-xs text-slate-400 font-medium">Sem depender do PC ligado</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="recursos" className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">{t.features.title}</h2>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">{t.features.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 hover:border-indigo-500/50 transition-all">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-100">{t.features.multiTenantTitle}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{t.features.multiTenantDesc}</p>
          </div>

          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 hover:border-indigo-500/50 transition-all">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-100">Resolução Autônoma & PDF</h3>
            <p className="text-xs text-slate-400 leading-relaxed">IA e atendentes atuam e geram relatórios técnicos em PDF com certificação de solução.</p>
          </div>

          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 hover:border-indigo-500/50 transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Kanban className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-100">{t.features.kanbanTitle}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{t.features.kanbanDesc}</p>
          </div>

          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 hover:border-indigo-500/50 transition-all">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-100">{t.features.notesTitle}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{t.features.notesDesc}</p>
          </div>
        </div>
      </section>

      {/* Footer with Official Logo & Credit Link helpusbr.com */}
      <footer className="mt-auto border-t border-slate-800/80 bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/helpus-logo.jpg" alt="HelpUS Logo" className="w-7 h-7 rounded-full object-cover border border-slate-700" />
            <span className="font-semibold text-slate-300">
              Desenvolvido por{' '}
              <a
                href="https://helpusbr.com"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 font-bold underline"
              >
                helpusbr.com
              </a>
            </span>
            <span>•</span>
            <span className="font-mono">support.helpusbr.com</span>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-slate-300 underline">
              Política de Privacidade
            </button>
            <button onClick={() => setIsAuthModalOpen(true)} className="hover:text-slate-300 underline">
              {t.nav.clientArea}
            </button>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccessLogin={handleSuccessLogin}
        t={t.auth}
      />

      {/* Cookie Consent Banner */}
      <CookieConsent lang={lang} onOpenPrivacy={() => setIsPrivacyOpen(true)} />

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} lang={lang} />
    </div>
  );
}
