'use client';

import React, { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  MessageSquare,
  Search,
  Filter,
  Flame,
  User,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { Ticket, TicketStatus, TicketPriority } from '@/types/ticket';

interface KanbanBoardProps {
  tickets: Ticket[];
  onTicketClick: (ticket: Ticket) => void;
  onQuickMove: (ticketId: string, newStatus: TicketStatus) => void;
}

interface Column {
  id: TicketStatus;
  title: string;
  badgeColor: string;
  borderColor: string;
  countColor: string;
}

const COLUMNS: Column[] = [
  {
    id: 'new',
    title: '🟡 Triagem / Novos',
    badgeColor: 'bg-amber-500/10 text-amber-400',
    borderColor: 'border-amber-500/20',
    countColor: 'bg-amber-500/20 text-amber-300',
  },
  {
    id: 'in_progress',
    title: '🔵 Em Atendimento',
    badgeColor: 'bg-indigo-500/10 text-indigo-400',
    borderColor: 'border-indigo-500/20',
    countColor: 'bg-indigo-500/20 text-indigo-300',
  },
  {
    id: 'waiting_client',
    title: '🟣 Aguardando Cliente',
    badgeColor: 'bg-purple-500/10 text-purple-400',
    borderColor: 'border-purple-500/20',
    countColor: 'bg-purple-500/20 text-purple-300',
  },
  {
    id: 'in_testing',
    title: '🟠 Em Validação / Testes',
    badgeColor: 'bg-orange-500/10 text-orange-400',
    borderColor: 'border-orange-500/20',
    countColor: 'bg-orange-500/20 text-orange-300',
  },
  {
    id: 'resolved',
    title: '🟢 Concluídos',
    badgeColor: 'bg-emerald-500/10 text-emerald-400',
    borderColor: 'border-emerald-500/20',
    countColor: 'bg-emerald-500/20 text-emerald-300',
  },
];

export default function KanbanBoard({ tickets, onTicketClick, onQuickMove }: KanbanBoardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.createdByName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCat = selectedCategory === 'all' || t.category === selectedCategory;
    const matchesPrio = selectedPriority === 'all' || t.priority === selectedPriority;

    return matchesSearch && matchesCat && matchesPrio;
  });

  const getPriorityBadge = (priority: TicketPriority) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-red-500/20 text-red-400 border border-red-500/30 rounded flex items-center gap-1"><Flame className="w-3 h-3" /> Urgente</span>;
      case 'high':
        return <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">Alta</span>;
      case 'medium':
        return <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700 rounded">Média</span>;
      case 'low':
        return <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-900 text-slate-400 border border-slate-800 rounded">Baixa</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código (PUB-101), assunto ou solicitante..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-full"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            <span>Categoria:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none"
            >
              <option value="all">Todas</option>
              <option value="bug">🐞 Bugs</option>
              <option value="feature">🚀 Recursos</option>
              <option value="question">❓ Dúvidas</option>
              <option value="support">🛠️ Suporte</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Prioridade:</span>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none"
            >
              <option value="all">Todas</option>
              <option value="urgent">🔥 Urgente</option>
              <option value="high">Alta</option>
              <option value="medium">Média</option>
              <option value="low">Baixa</option>
            </select>
          </div>
        </div>
      </div>

      {/* Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {COLUMNS.map((col) => {
          const colTickets = filteredTickets.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className={`bg-slate-900/60 border ${col.borderColor} rounded-2xl p-3 flex flex-col h-[calc(100vh-250px)]`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
                <span className="font-bold text-xs text-slate-200">{col.title}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${col.countColor}`}>
                  {colTickets.length}
                </span>
              </div>

              {/* Cards List */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {colTickets.length === 0 ? (
                  <div className="text-center py-10 text-slate-600 text-xs border border-dashed border-slate-800/60 rounded-xl">
                    Nenhum chamado nesta coluna
                  </div>
                ) : (
                  colTickets.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onTicketClick(t)}
                      className="p-3.5 bg-slate-950 border border-slate-800/90 hover:border-indigo-500/60 rounded-xl shadow-lg transition-all duration-200 hover:scale-[1.01] cursor-pointer space-y-2 group"
                    >
                      {/* Top Meta */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                          {t.code}
                        </span>
                        {getPriorityBadge(t.priority)}
                      </div>

                      {/* Title */}
                      <h4 className="font-semibold text-xs text-slate-100 group-hover:text-indigo-300 transition-colors leading-snug">
                        {t.title}
                      </h4>

                      {/* Description Preview */}
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {t.description}
                      </p>

                      {/* Tenant Tag */}
                      <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        <span>{t.tenantName}</span>
                      </div>

                      {/* Footer Info */}
                      <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[10px] text-slate-500">
                        <span className="truncate max-w-[110px]">👤 {t.createdByName}</span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <MessageSquare className="w-3 h-3 text-indigo-400" />
                          {t.messages.length}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
