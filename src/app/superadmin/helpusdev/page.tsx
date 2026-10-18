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

interface IntentProjection {
  intent_id: string;
  verb: string;
  target_id: string;
  status: 'submitted' | 'validated' | 'accepted' | 'rejected' | 'applied' | 'expired';
  issued_at_utc: string;
  acked_at_utc?: string;
  host_ack_detail?: string;
}

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
      if (!current || current.role !== 'super_admin') {
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
        // Never report presumed execution: report exact server status ('submitted') awaiting host ACK!
        setIntentFeedback(
          `Intenção registrada no Control Center: id=${createdIntent.intent_id} | status=${createdIntent.status.toUpperCase()} (Aguardando ACK real do executor local Windows — não presumir aplicação antes de status='applied').`
        );
      }
      await fetchDashboardEndpoints(sessionToken);
    } catch (err: any) {
      setIntentFeedback(`Erro de rede ao enviar intenção: ${err?.message || err}`);
    } finally {
      setSubmittingVerb(null);
    }
  };

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
            HelpUSDev Control Center — Supervisão Multiagente (R18.5)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Persistência SQLite Transacional (WAL) + Intenções Administrativas com ACK Verificado | Versão de Estado: #{overview?.state_version ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => sessionToken && fetchDashboardEndpoints(sessionToken)}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
          >
            {loading ? 'Carregando...' : 'Atualizar Agora'}
          </button>
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
        </div>
      </header>

      {errorMsg && (
        <div
          data-testid="control-center-error-banner"
          className="bg-rose-950/80 border border-rose-500/60 text-rose-200 rounded-xl p-4 text-xs font-mono"
        >
          Erro ao consultar endpoints do Control Center: {errorMsg}
        </div>
      )}

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

      {/* Disponibilidade Observada dos Agentes (Separação Estrita DOM Click vs Resposta Real) */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-200 mb-3">
          Disponibilidade Observada dos Agentes (Separação Honesta: Clique DOM vs Resposta Real vs Validação)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 pr-4">Agente</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Último Clique DOM (delivery_acked)</th>
                <th className="py-2 pr-4">Última Resposta Real (model_reply_observed)</th>
                <th className="py-2 pr-4">Última Validação (output_validated)</th>
                <th className="py-2">Diagnóstico Redigido</th>
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

      {/* Controles de Intenção Administrativa Autenticada & Status de ACK Real */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-200">
            Intenções Administrativas Autenticadas (helpusdev.intent.v1 — Revalidação Obrigatória no Host Local)
          </h2>
          <span className="text-xs text-slate-400">
            Pendentes de ACK: <strong className="text-amber-300">{overview?.counts?.pending_intents ?? 0}</strong> | Aplicadas com ACK real:{' '}
            <strong className="text-emerald-300">{overview?.counts?.applied_intents ?? 0}</strong>
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          {(
            [
              { verb: 'pause', label: 'Pausar Fila (pause)' },
              { verb: 'resume', label: 'Retomar Fila (resume)' },
              { verb: 'reprioritize', label: 'Repriorizar Tarefa (reprioritize)' },
              { verb: 'request_diagnostics', label: 'Solicitar Diagnóstico (request_diagnostics)' },
            ] as const
          ).map((btn) => (
            <button
              key={btn.verb}
              type="button"
              disabled={submittingVerb !== null}
              onClick={() => handleDispatchIntent(btn.verb, 'coordinator')}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-200 transition"
            >
              {submittingVerb === btn.verb ? `Enviando ${btn.verb}...` : btn.label}
            </button>
          ))}
        </div>
        {intentFeedback && (
          <div data-testid="intent-feedback-box" className="text-xs text-sky-300 font-mono bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            {intentFeedback}
          </div>
        )}
        {intents.length > 0 && (
          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-1.5 pr-3">Intent ID</th>
                  <th className="py-1.5 pr-3">Verbo</th>
                  <th className="py-1.5 pr-3">Alvo</th>
                  <th className="py-1.5 pr-3">Status Real</th>
                  <th className="py-1.5 pr-3">ACK do Host (acked_at_utc)</th>
                  <th className="py-1.5">Detalhe do Executor Local</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {intents.map((it) => (
                  <tr key={it.intent_id}>
                    <td className="py-1.5 pr-3 font-mono text-slate-300">{it.intent_id}</td>
                    <td className="py-1.5 pr-3 font-semibold text-sky-300">{it.verb}</td>
                    <td className="py-1.5 pr-3 font-mono text-slate-400">{it.target_id}</td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          it.status === 'applied'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                            : it.status === 'submitted'
                            ? 'bg-amber-950 text-amber-300 border border-amber-700'
                            : 'bg-rose-950 text-rose-300 border border-rose-700'
                        }`}
                      >
                        {it.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-slate-300">{it.acked_at_utc || 'AGUARDANDO_HOST_ACK'}</td>
                    <td className="py-1.5 text-slate-400">{it.host_ack_detail || 'Pendente de consumo pelo worker Windows'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tarefas Recentes e Timeline de Eventos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-200 mb-3">Tarefas Recentes ({tasks.length})</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {tasks.map((tk) => (
              <div key={tk.task_id} className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs flex justify-between items-center">
                <div>
                  <div className="font-mono font-semibold text-slate-200">{tk.task_id}</div>
                  <div className="text-slate-400">{tk.title} — Agente: {tk.assigned_agent}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono">{tk.state}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-200 mb-3">
            Timeline de Eventos Canônicos ({events.length} | Lacunas ativas: {overview?.counts?.seq_gaps ?? 0} | Reconciliadas: {overview?.counts?.reconciled_seq_gaps ?? 0})
          </h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {events.map((ev) => (
              <div key={ev.event_id} className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs">
                <div className="flex justify-between font-mono text-slate-400">
                  <span>seq #{ev.seq} — {ev.event_type}</span>
                  <span>{ev.occurred_at_utc}</span>
                </div>
                <div className="text-slate-200 mt-1">{ev.summary_redacted}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Central de Arquivos CAS & Smart Patch Engine (R21) */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-sky-300">
              Central de Arquivos CAS &amp; Smart Patch Engine (HelpUSDev R21)
            </h2>
            <p className="text-xs text-slate-400">
              Repositório soberano de artefatos por SHA-256 e alterações parciais atômicas com verificação Compare-And-Swap (CAS).
            </p>
          </div>
          <div className="flex gap-4 text-xs font-mono">
            <span className="text-slate-400">Artefatos CAS: <strong className="text-emerald-300">{artifacts.length}</strong></span>
            <span className="text-slate-400">Patches Aplicados: <strong className="text-indigo-300">{patches.length}</strong></span>
            <span className="text-slate-400">Travas Ativas: <strong className="text-amber-300">{locks.length}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          {/* Coluna 1: Artefatos CAS */}
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-300">Artefatos Armazenados por Hash (CAS)</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {artifacts.length === 0 ? (
                <div className="text-slate-500 italic p-3 bg-slate-950/40 rounded-lg">Nenhum artefato armazenado no momento.</div>
              ) : (
                artifacts.map((art: any) => (
                  <div key={art.artifact_ref} className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] space-y-1">
                    <div className="flex justify-between items-center text-sky-300 font-semibold">
                      <span>{art.filename || art.artifact_ref.slice(0, 20) + '...'}</span>
                      <span className="text-slate-400 text-[10px]">{art.size_bytes} bytes</span>
                    </div>
                    <div className="text-slate-400 truncate">{art.artifact_ref}</div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Projeto: {art.project} | Agente: {art.agent}</span>
                      <span>{art.created_at_utc?.slice(0, 19)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Coluna 2: Histórico de Smart Patches */}
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-300">Histórico de Smart Patches com CAS</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {patches.length === 0 ? (
                <div className="text-slate-500 italic p-3 bg-slate-950/40 rounded-lg">Nenhum patch aplicado recentemente.</div>
              ) : (
                patches.map((pt: any) => (
                  <div key={pt.patch_id} className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 text-[11px] space-y-1">
                    <div className="flex justify-between font-mono font-semibold">
                      <span className="text-slate-200">{pt.patch_id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${pt.status === 'applied' ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`}>
                        {pt.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-slate-400 font-mono text-[10px] truncate">{pt.file_path}</div>
                    <div className="text-[10px] text-slate-500 flex justify-between font-mono">
                      <span>CAS: {pt.expected_sha256?.slice(0, 8)}... → {pt.resulting_sha256?.slice(0, 8)}...</span>
                      <span>{pt.applied_at_utc?.slice(0, 19)}</span>
                    </div>
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
