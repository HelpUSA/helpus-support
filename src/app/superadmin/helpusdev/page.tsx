'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AuthService, UserAccount, isAuthorizedSuperAdmin } from '@/lib/auth';
import {
  Activity,
  Cpu,
  Layers,
  ListChecks,
  FileText,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight
} from 'lucide-react';

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

interface IntentProjection {
  intent_id: string;
  verb: string;
  target_id: string;
  status: 'submitted' | 'validated' | 'accepted' | 'rejected' | 'applied' | 'expired';
  issued_at_utc: string;
  acked_at_utc?: string;
  host_ack_detail?: string;
}

type MobileTab = 'overview' | 'agents' | 'tasks' | 'events' | 'intents' | 'cas';

export default function HelpUSDevSuperAdminControlCenterPage() {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [csrfToken, setCsrfToken] = useState<string>('');
  const [overview, setOverview] = useState<any>(null);
  const [tasks, setTasks] = useState<TaskProjection[]>([]);
  const [events, setEvents] = useState<EventProjection[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [intents, setIntents] = useState<IntentProjection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [intentFeedback, setIntentFeedback] = useState<string>('');
  const [submittingVerb, setSubmittingVerb] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('overview');

  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [patches, setPatches] = useState<any[]>([]);
  const [locks, setLocks] = useState<any[]>([]);

  const fetchDashboardEndpoints = useCallback(async (bearer: string) => {
    setErrorMsg('');
    const headers = {
      Authorization: `Bearer ${bearer}`,
      'X-HelpUS-Tenant-Id': 'helpus-support',
    };
    const [ovRes, tkRes, evRes, agRes, artRes] = await Promise.all([
      fetch('/api/superadmin/helpusdev/overview', { headers, cache: 'no-store' }),
      fetch('/api/superadmin/helpusdev/tasks?limit=30', { headers, cache: 'no-store' }),
      fetch('/api/superadmin/helpusdev/events?limit=40', { headers, cache: 'no-store' }),
      fetch('/api/superadmin/helpusdev/agents', { headers, cache: 'no-store' }),
      fetch('/api/superadmin/helpusdev/artifacts', { headers, cache: 'no-store' }).catch(() => null),
    ]);

    if (!ovRes.ok) {
      const errBody = await ovRes.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${ovRes.status} ao consultar overview`);
    }

    const [ovJson, tkJson, evJson, agJson, artJson] = await Promise.all([
      ovRes.json(),
      tkRes.json(),
      evRes.json(),
      agRes.json(),
      artRes && artRes.ok ? artRes.json() : Promise.resolve({ artifacts: [], patches: [], locks: [] }),
    ]);

    setOverview(ovJson);
    setTasks(Array.isArray(tkJson.items) ? tkJson.items : []);
    setEvents(Array.isArray(evJson.items) ? evJson.items : []);
    setAgents(Array.isArray(agJson.agents) ? agJson.agents : []);
    setIntents(Array.isArray(ovJson.recent_intents) ? ovJson.recent_intents : []);
    setArtifacts(Array.isArray(artJson?.artifacts) ? artJson.artifacts : []);
    setPatches(Array.isArray(artJson?.patches) ? artJson.patches : []);
    setLocks(Array.isArray(artJson?.locks) ? artJson.locks : []);
  }, []);

  const initializeAndLoad = useCallback(async () => {
    setLoading(true);
    try {
      const current = AuthService.getCurrentUser();
      setUser(current);
      if (!current || !isAuthorizedSuperAdmin(current)) {
        setLoading(false);
        return;
      }

      let activeBearer = sessionToken;
      if (!activeBearer) {
        const authRes = await fetch('/api/superadmin/helpusdev/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: current.email,
            user_id: current.id,
            tenant_id: 'helpus-support',
          }),
        });
        const authJson = await authRes.json();
        if (!authRes.ok || !authJson.ok) {
          throw new Error(authJson.error || 'Falha na autenticação SuperAdmin no servidor');
        }
        activeBearer = authJson.sessionToken;
        setSessionToken(authJson.sessionToken);
        setCsrfToken(authJson.csrfToken);
      }

      await fetchDashboardEndpoints(activeBearer);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao carregar dados do Control Center');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, fetchDashboardEndpoints]);

  useEffect(() => {
    initializeAndLoad();
    const timer = setInterval(() => {
      if (sessionToken) {
        fetchDashboardEndpoints(sessionToken).catch((e) => setErrorMsg(e?.message || 'Erro de atualização'));
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [initializeAndLoad, sessionToken, fetchDashboardEndpoints]);

  const handleDispatchIntent = async (
    verb: 'pause' | 'resume' | 'reprioritize' | 'request_diagnostics',
    targetId: string = 'coordinator'
  ) => {
    if (!sessionToken || !csrfToken || !overview) {
      setIntentFeedback('Erro: sessão ou state_version indisponível. Atualize os dados primeiro.');
      return;
    }
    setSubmittingVerb(verb);
    setIntentFeedback(`Enviando intenção '${verb}' (expected_state_version=${overview.state_version})...`);
    try {
      const res = await fetch('/api/superadmin/helpusdev/intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
          'X-HelpUS-Tenant-Id': 'helpus-support',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          host_id: 'host-win-fd8a91c2',
          workspace_id: 'ws-helpusdev-7b3e40a1',
          target_id: targetId,
          verb,
          reason: `SuperAdmin UI action: ${verb} on ${targetId}`,
          nonce: `ui-nonce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          expected_state_version: overview.state_version,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setIntentFeedback(`Falha (${res.status}): ${data.error || 'Intenção recusada pelo servidor'}`);
      } else {
        const createdIntent = data.intent as IntentProjection;
        setIntentFeedback(
          `Intenção registrada no Control Center: id=${createdIntent.intent_id} | status=${createdIntent.status.toUpperCase()} (Aguardando ACK real do executor local Windows).`
        );
      }
      await fetchDashboardEndpoints(sessionToken);
    } catch (err: any) {
      setIntentFeedback(`Erro de rede ao enviar intenção: ${err?.message || err}`);
    } finally {
      setSubmittingVerb(null);
    }
  };

  if (!user || !isAuthorizedSuperAdmin(user)) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center border border-rose-500/20">
            <XCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-rose-400">
            Acesso Restrito — SuperAdmin
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            Esta área é exclusiva para contas Master SuperAdmin verificadas no servidor. Manipulações de perfil no navegador ou acessos anônimos são bloqueados por segurança.
          </p>
        </div>
      </div>
    );
  }

  const isStale = overview ? Boolean(overview.is_stale) : true;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-6">
      {/* Header com Responsividade e Indicadores de Estado */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-2xl font-bold text-sky-400 flex items-center gap-2">
              <Cpu className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
              HelpUSDev Control Center
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full">
              R26.4 Mobile
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
            Supervisão Multiagente (WAL) | Estado: #{overview?.state_version ?? '—'} | Tailscale Ready
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => sessionToken && fetchDashboardEndpoints(sessionToken)}
            disabled={loading}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
          <div
            data-testid="stale-indicator-banner"
            className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border flex items-center gap-1.5 ${
              isStale
                ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                : 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            }`}
          >
            {isStale ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{isStale ? 'Sincronizando' : 'Ao Vivo'}</span>
          </div>
        </div>
      </header>

      {/* Banner de Otimização Mobile & Tailscale Read-Only */}
      <div className="flex md:hidden items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5 text-sky-300 font-medium">
          <Smartphone className="w-3.5 h-3.5" /> Modo Smartphone Otimizado
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
          Tailscale Read-Only
        </span>
      </div>

      {/* Mobile Tab Selector Bar (Sticky para Smartphones) */}
      <nav className="flex md:hidden overflow-x-auto gap-1.5 p-1 bg-slate-900/90 rounded-xl border border-slate-800 sticky top-16 z-40 backdrop-blur">
        {[
          { id: 'overview', label: 'Métricas' },
          { id: 'agents', label: `Agentes (${agents.length})` },
          { id: 'tasks', label: `Tarefas (${tasks.length})` },
          { id: 'events', label: `Eventos (${events.length})` },
          { id: 'intents', label: 'Intenções' },
          { id: 'cas', label: `CAS (${artifacts.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id as MobileTab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition min-h-[36px] ${
              mobileTab === tab.id
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {errorMsg && (
        <div
          data-testid="control-center-error-banner"
          className="bg-rose-950/80 border border-rose-500/60 text-rose-200 rounded-xl p-3 text-xs font-mono"
        >
          Erro ao consultar endpoints: {errorMsg}
        </div>
      )}

      {/* Seção 1: Métricas Gerais (Visível em overview ou desktop) */}
      <section className={`${mobileTab === 'overview' ? 'grid' : 'hidden md:grid'} grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 sm:gap-4`}>
        {[
          { label: 'Tarefas Ativas', value: overview?.counts?.active_tasks ?? 0, color: 'text-sky-400' },
          { label: 'Backlog Fila', value: overview?.counts?.queued_backlog ?? 0, color: 'text-teal-400' },
          { label: 'Bloqueadas', value: overview?.counts?.blocked_tasks ?? 0, color: 'text-rose-400' },
          { label: 'Aguardando', value: overview?.counts?.awaiting_human ?? 0, color: 'text-amber-400' },
          { label: 'Concluídas', value: overview?.counts?.completed_tasks ?? 0, color: 'text-emerald-400' },
          { label: 'Eventos (Seq)', value: overview?.counts?.total_events ?? 0, color: 'text-purple-400' },
        ].map((metric) => (
          <div key={metric.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4">
            <div className="text-[11px] sm:text-xs text-slate-400">{metric.label}</div>
            <div className={`text-xl sm:text-2xl font-bold mt-1 ${metric.color}`}>{metric.value}</div>
          </div>
        ))}
      </section>

      {/* Seção 2: Agentes Conectados */}
      <section className={`${mobileTab === 'agents' || mobileTab === 'overview' ? 'block' : 'hidden md:block'} bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3`}>
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400" />
            Disponibilidade dos Agentes ({agents.length})
          </h2>
          <span className="text-[10px] text-slate-400 font-mono">Separação: DOM Click vs Modelo Real</span>
        </div>

        {/* Visualização em Cards para Smartphones (Mobile-First) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:hidden gap-3">
          {agents.map((ag) => (
            <div key={ag.agent_id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">{ag.display_name}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    ag.availability === 'online'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : ag.availability === 'partial'
                      ? 'bg-amber-950 text-amber-300 border border-amber-700'
                      : 'bg-rose-950 text-rose-300 border border-rose-700'
                  }`}
                >
                  {ag.availability.toUpperCase()}
                </span>
              </div>
              <div className="space-y-1 text-[11px] text-slate-400 font-mono">
                <div>DOM Ack: <span className="text-slate-300">{ag.last_delivery_acked_utc || '—'}</span></div>
                <div>Modelo: <span className="text-emerald-300">{ag.last_model_reply_observed_utc || '—'}</span></div>
                <div>Validado: <span className="text-sky-300">{ag.last_output_validated_utc || '—'}</span></div>
              </div>
              {ag.diagnostic_note_redacted && (
                <div className="text-[10px] text-slate-400 bg-slate-900 p-2 rounded border border-slate-800">
                  {ag.diagnostic_note_redacted}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Visualização em Tabela para Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 pr-4">Agente</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Clique DOM (delivery_acked)</th>
                <th className="py-2 pr-4">Resposta Real (model_reply)</th>
                <th className="py-2 pr-4">Validação (validated)</th>
                <th className="py-2">Diagnóstico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {agents.map((ag) => (
                <tr key={ag.agent_id}>
                  <td className="py-2.5 pr-4 font-semibold text-slate-200">{ag.display_name}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        ag.availability === 'online'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : ag.availability === 'partial'
                          ? 'bg-amber-950 text-amber-300 border border-amber-700'
                          : 'bg-rose-950 text-rose-300 border border-rose-700'
                      }`}
                    >
                      {ag.availability.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-slate-300">{ag.last_delivery_acked_utc || '—'}</td>
                  <td className="py-2.5 pr-4 font-mono text-emerald-300">{ag.last_model_reply_observed_utc || '—'}</td>
                  <td className="py-2.5 pr-4 font-mono text-sky-300">{ag.last_output_validated_utc || '—'}</td>
                  <td className="py-2.5 text-slate-400">{ag.diagnostic_note_redacted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Seção 3: Intenções Administrativas */}
      <section className={`${mobileTab === 'intents' || mobileTab === 'overview' ? 'block' : 'hidden md:block'} bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            Intenções Administrativas Autenticadas
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">
            Pendentes: <strong className="text-amber-300">{overview?.counts?.pending_intents ?? 0}</strong> | Aplicadas: <strong className="text-emerald-300">{overview?.counts?.applied_intents ?? 0}</strong>
          </span>
        </div>

        {/* Botões Touch-Friendly com altura mínima 44px */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(
            [
              { verb: 'pause', label: 'Pausar Fila' },
              { verb: 'resume', label: 'Retomar Fila' },
              { verb: 'reprioritize', label: 'Repriorizar' },
              { verb: 'request_diagnostics', label: 'Diagnóstico' },
            ] as const
          ).map((btn) => (
            <button
              key={btn.verb}
              type="button"
              disabled={submittingVerb !== null}
              onClick={() => handleDispatchIntent(btn.verb, 'coordinator')}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 border border-slate-700 text-slate-200 transition flex items-center justify-center text-center"
            >
              {submittingVerb === btn.verb ? 'Enviando...' : btn.label}
            </button>
          ))}
        </div>

        {intentFeedback && (
          <div data-testid="intent-feedback-box" className="text-xs text-sky-300 font-mono bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            {intentFeedback}
          </div>
        )}

        {/* Intenções Recentes em Cards para Mobile */}
        {intents.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300">Intenções Registradas</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {intents.map((it) => (
                <div key={it.intent_id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-sky-300 uppercase">{it.verb}</span>
                    <span className="text-[10px] text-slate-400 font-mono ml-2">{it.intent_id}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      it.status === 'applied'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                        : it.status === 'submitted'
                        ? 'bg-amber-950 text-amber-300 border border-amber-700'
                        : 'bg-rose-950 text-rose-300 border border-rose-700'
                    }`}
                  >
                    {it.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Seção 4: Tarefas Recentes e Eventos Canônicos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Tarefas */}
        <section className={`${mobileTab === 'tasks' || mobileTab === 'overview' ? 'block' : 'hidden md:block'} bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3`}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
              <ListChecks className="w-4 h-4 text-sky-400" />
              Tarefas Recentes ({tasks.length})
            </h2>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="text-slate-500 italic p-3 text-xs">Nenhuma tarefa recente.</div>
            ) : (
              tasks.map((tk) => (
                <div key={tk.task_id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs flex justify-between items-center gap-2">
                  <div className="truncate">
                    <div className="font-mono font-semibold text-slate-200 truncate">{tk.task_id}</div>
                    <div className="text-slate-400 text-[11px] truncate">{tk.title} — {tk.assigned_agent}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap ${
                    tk.state === 'completed'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : tk.state === 'blocked' || tk.state === 'failed'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-slate-800 text-sky-300'
                  }`}>
                    {tk.state}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Timeline de Eventos */}
        <section className={`${mobileTab === 'events' || mobileTab === 'overview' ? 'block' : 'hidden md:block'} bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3`}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-400" />
              Timeline de Eventos ({events.length})
            </h2>
            <span className="text-[10px] text-slate-400 font-mono">Gaps: {overview?.counts?.seq_gaps ?? 0}</span>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {events.length === 0 ? (
              <div className="text-slate-500 italic p-3 text-xs">Nenhum evento registrado.</div>
            ) : (
              events.map((ev) => (
                <div key={ev.event_id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between font-mono text-[10px] text-slate-400">
                    <span className="text-sky-300 font-semibold">#{ev.seq} — {ev.event_type}</span>
                    <span>{ev.occurred_at_utc?.slice(11, 19)}</span>
                  </div>
                  <div className="text-slate-200 text-[11px] line-clamp-2">{ev.summary_redacted}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Seção 5: Central de Arquivos CAS & Smart Patches */}
      <section className={`${mobileTab === 'cas' || mobileTab === 'overview' ? 'block' : 'hidden md:block'} bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-sky-300 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-emerald-400" />
            Central de Arquivos CAS &amp; Patches Atômicos
          </h2>
          <div className="flex gap-3 text-[11px] font-mono text-slate-400">
            <span>CAS: <strong className="text-emerald-300">{artifacts.length}</strong></span>
            <span>Patches: <strong className="text-indigo-300">{patches.length}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          {/* Artefatos CAS */}
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-300">Artefatos Armazenados (CAS)</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {artifacts.length === 0 ? (
                <div className="text-slate-500 italic p-3 bg-slate-950/40 rounded-xl text-xs">Nenhum artefato armazenado.</div>
              ) : (
                artifacts.map((art: any) => (
                  <div key={art.artifact_ref} className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 font-mono text-[11px] space-y-1">
                    <div className="flex justify-between items-center text-sky-300 font-semibold">
                      <span className="truncate">{art.filename || art.artifact_ref.slice(0, 20)}</span>
                      <span className="text-slate-400 text-[10px]">{art.size_bytes} B</span>
                    </div>
                    <div className="text-slate-400 text-[10px] truncate">{art.artifact_ref}</div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>{art.agent}</span>
                      <span>{art.created_at_utc?.slice(0, 19)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Histórico de Patches */}
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-300">Smart Patches Aplicados</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {patches.length === 0 ? (
                <div className="text-slate-500 italic p-3 bg-slate-950/40 rounded-xl text-xs">Nenhum patch aplicado recentemente.</div>
              ) : (
                patches.map((pt: any) => (
                  <div key={pt.patch_id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-[11px] space-y-1">
                    <div className="flex justify-between font-mono font-semibold">
                      <span className="text-slate-200 truncate">{pt.patch_id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${pt.status === 'applied' ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`}>
                        {pt.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-slate-400 font-mono text-[10px] truncate">{pt.file_path}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
