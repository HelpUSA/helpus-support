'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AuthService, UserAccount } from '@/lib/auth';

interface AgentStatus {
  agent_id: string;
  display_name: string;
  role: string;
  availability: 'online' | 'partial' | 'unavailable' | 'unknown';
  last_delivery_acked_utc: string | null;
  last_model_reply_observed_utc: string | null;
  last_output_validated_utc: string | null;
  last_heartbeat_utc: string | null;
  diagnostic_note_redacted: string;
}

interface TaskProjection {
  task_id: string;
  workflow_id: string;
  project_id: string;
  title: string;
  state: string;
  assigned_agent: string;
  risk_class: string;
  last_event_seq: number;
  last_delivery_acked_utc?: string | null;
  last_model_reply_observed: string | null;
  last_output_validated: string | null;
  updated_at_utc: string;
  block_reason_redacted?: string | null;
}

interface EventProjection {
  event_id: string;
  seq: number;
  workflow_id: string;
  task_id: string;
  correlation_id: string;
  event_type: string;
  occurred_at_utc: string;
  agent: string;
  status: string;
  summary_redacted: string;
  attempt_no: number;
}

export default function HelpUSDevSuperAdminControlCenterPage() {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [tasks, setTasks] = useState<TaskProjection[]>([]);
  const [events, setEvents] = useState<EventProjection[]>([]);
  const [intentFeedback, setIntentFeedback] = useState<string>('');

  const loadData = useCallback(async () => {
    const current = AuthService.getCurrentUser();
    setUser(current);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!user || user.role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-900 border border-rose-500/40 rounded-xl p-6 shadow-xl">
          <h1 className="text-xl font-bold text-rose-400 mb-2">
            Acesso Restrito — HelpUSDev Control Center (RBAC SuperAdmin)
          </h1>
          <p className="text-sm text-slate-300">
            Esta área é exclusiva para contas com papel <code className="text-rose-300">super_admin</code> verificadas no servidor e isoladas por tenant. Contas de clientes ou agentes não possuem permissão de leitura ou envio de intenções.
          </p>
        </div>
      </div>
    );
  }

  const isStale = overview ? Boolean(overview.is_stale) : true;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h1 className="text-2xl font-bold text-sky-400">
            HelpUSDev Control Center — Supervisão Multiagente (R18)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Projeção somente-leitura + Fila de Intenções Administrativas Autenticadas | Fonte de verdade: SQLite Local (ai-bridge-local)
          </p>
        </div>
        <div
          data-testid="stale-indicator-banner"
          className={`px-4 py-2 rounded-lg text-xs font-semibold border ${
            isStale
              ? 'bg-amber-950/80 border-amber-500 text-amber-300'
              : 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
          }`}
        >
          {overview?.stale_banner_message || 'DADOS DEFASADOS: Aguardando sincronização outbound do worker Windows'}
        </div>
      </header>

      {/* Visão Geral */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Tarefas Ativas', value: overview?.counts?.active_tasks ?? 0, color: 'text-sky-400' },
          { label: 'Backlog na Fila', value: overview?.counts?.queued_backlog ?? 0, color: 'text-teal-400' },
          { label: 'Bloqueadas', value: overview?.counts?.blocked_tasks ?? 0, color: 'text-rose-400' },
          { label: 'Aguardando Humano', value: overview?.counts?.awaiting_human ?? 0, color: 'text-amber-400' },
          { label: 'Concluídas', value: overview?.counts?.completed_tasks ?? 0, color: 'text-emerald-400' },
          { label: 'Eventos (Seq)', value: overview?.counts?.total_events ?? 0, color: 'text-purple-400' },
        ].map((metric) => (
          <div key={metric.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">{metric.label}</div>
            <div className={`text-2xl font-bold mt-1 ${metric.color}`}>{metric.value}</div>
          </div>
        ))}
      </section>

      {/* Agentes: Entrega DOM vs Resposta Real do Modelo vs Validação */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-base font-bold text-emerald-400 mb-3">
          Disponibilidade Observada dos Agentes (Entrega DOM ≠ Resposta do Modelo)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 pr-4">Agente</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4">Último Clique DOM (delivery_acked)</th>
                <th className="py-2 pr-4">Última Resposta Real (model_reply_observed)</th>
                <th className="py-2 pr-4">Última Saída Validada (output_validated)</th>
                <th className="py-2">Diagnóstico Sanitizado</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.agents || []).map((ag: AgentStatus) => (
                <tr key={ag.agent_id} className="border-b border-slate-800/60">
                  <td className="py-2.5 pr-4 font-semibold text-slate-100">{ag.display_name}</td>
                  <td className="py-2.5 pr-4 uppercase font-bold">{ag.availability}</td>
                  <td className="py-2.5 pr-4">{ag.last_delivery_acked_utc || '—'}</td>
                  <td className="py-2.5 pr-4">{ag.last_model_reply_observed_utc || '—'}</td>
                  <td className="py-2.5 pr-4">{ag.last_output_validated_utc || '—'}</td>
                  <td className="py-2.5 text-slate-400">{ag.diagnostic_note_redacted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Intenções Administrativas Permitidas (Ensaio R18) */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-purple-400">
            Intenções Administrativas (helpusdev.intent.v1)
          </h2>
          <p className="text-xs text-slate-400">
            Revalidadas obrigatoriamente pelo executor Windows sob Trusted Workspace e CAS local.
          </p>
        </div>
        <div className="flex gap-2">
          {(['pause', 'resume', 'reprioritize', 'request_diagnostics'] as const).map((verb) => (
            <button
              key={verb}
              type="button"
              onClick={() => setIntentFeedback(`Intenção '${verb}' preparada para submissão autenticada.`)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-sky-300"
            >
              {verb.toUpperCase()}
            </button>
          ))}
        </div>
        {intentFeedback && <div className="w-full text-xs text-emerald-400">{intentFeedback}</div>}
      </section>
    </div>
  );
}
