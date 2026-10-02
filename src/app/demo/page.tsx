'use client';

import React from 'react';
import Link from 'next/link';
import HelpUsSupportWidget from '@/components/HelpUsSupportWidget';
import { ArrowLeft, Sparkles, Image, Layers, CheckCircle2, ShieldCheck, Palette, Code, ExternalLink } from 'lucide-react';

export default function PublicArteDemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-indigo-600/20 border-b border-indigo-500/30 px-4 py-2.5 text-xs text-indigo-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>
            <strong>Modo de Simulação Live:</strong> Testando a experiência do Widget de Suporte embutido dentro da plataforma <strong>Public Arte</strong> do Tércio.
          </span>
        </div>
        <Link
          href="/"
          className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Ir para o Painel Admin Central
        </Link>
      </div>

      {/* Simulated Public Arte Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center font-black text-white text-base">
            PA
          </div>
          <div>
            <h1 className="font-bold text-sm text-white">Public Arte App</h1>
            <p className="text-[11px] text-slate-400">Plataforma de Gestão de Artes & Mockups</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-400">Usuário: <strong className="text-slate-200">Tércio (Diretor)</strong></span>
          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-bold">
            Tenant: publicarte
          </span>
        </div>
      </header>

      {/* Main Content Area Simulation */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-6 space-y-6">
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Palette className="w-5 h-5 text-purple-400" /> Painel de Projetos de Arte
            </h2>
            <button className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-medium transition-colors">
              + Novo Mockup
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="w-full h-28 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-800">
                <Image className="w-8 h-8 text-slate-700" />
              </div>
              <h3 className="font-semibold text-slate-200">Campanha Outdoor Verão 2026</h3>
              <p className="text-slate-400 text-[11px]">Arte finalizada • Formato 9x3m</p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="w-full h-28 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-800">
                <Layers className="w-8 h-8 text-slate-700" />
              </div>
              <h3 className="font-semibold text-slate-200">Banner Fachada Loja Centro</h3>
              <p className="text-slate-400 text-[11px]">Em revisão pelo cliente • 300DPI</p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="w-full h-28 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-800">
                <Image className="w-8 h-8 text-slate-700" />
              </div>
              <h3 className="font-semibold text-slate-200">Adesivação Frota de Veículos</h3>
              <p className="text-slate-400 text-[11px]">Aguardando aprovação final</p>
            </div>
          </div>
        </div>

        {/* Code Snippet Box showing how simple it is to integrate into Public Arte */}
        <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-3 text-xs">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold">
            <Code className="w-4 h-4" />
            <span>Como este Widget está integrado no Public Arte:</span>
          </div>
          <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-indigo-200 overflow-x-auto">
{`<HelpUsSupportWidget
  tenantId="publicarte"
  clientName="Public Arte"
  userEmail="tercio@publicarte.com.br"
  userName="Tércio"
  apiUrl="https://support.helpusbr.com/api"
  primaryColor="#6366f1"
/>`}
          </pre>
          <p className="text-slate-400 text-[11px]">
            💡 Clique no botão flutuante roxo <strong>"Suporte & Chamados"</strong> no canto inferior direito para testar a abertura e acompanhamento de tickets.
          </p>
        </div>
      </main>

      {/* Embedded Widget */}
      <HelpUsSupportWidget
        tenantId="publicarte"
        clientName="Public Arte"
        userEmail="tercio@publicarte.com.br"
        userName="Tércio"
        primaryColor="#6366f1"
      />
    </div>
  );
}
