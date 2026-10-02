'use client';

import React from 'react';
import Link from 'next/link';
import { Kanban, Globe, ShieldCheck, MonitorPlay, Sparkles } from 'lucide-react';
import { Tenant } from '@/types/ticket';

interface NavbarProps {
  tenants: Tenant[];
  selectedTenantId: string;
  onSelectTenant: (tenantId: string) => void;
  ticketCounts?: {
    total: number;
    urgent: number;
    newCount: number;
  };
}

export default function Navbar({
  tenants,
  selectedTenantId,
  onSelectTenant,
  ticketCounts = { total: 4, urgent: 1, newCount: 1 },
}: NavbarProps) {
  return (
    <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand with Official HelpUS Logo Image */}
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

        {/* Tenant Filter Selector */}
        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          <Globe className="w-4 h-4 text-indigo-400" />
          <span className="text-xs text-slate-400 font-medium">Cliente:</span>
          <select
            value={selectedTenantId}
            onChange={(e) => onSelectTenant(e.target.value)}
            className="bg-transparent text-xs text-slate-100 font-medium focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-slate-900 text-slate-200">
              🌐 Todos os Clientes ({ticketCounts.total})
            </option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id} className="bg-slate-900 text-slate-200">
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Links */}
        <div className="flex items-center gap-4 text-xs font-medium">
          <Link
            href="/portal"
            className="flex items-center gap-1.5 px-3 py-2 text-indigo-400 bg-indigo-500/10 rounded-xl border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
          >
            <Kanban className="w-4 h-4" />
            Portal de Chamados
          </Link>
        </div>
      </div>
    </header>
  );
}
