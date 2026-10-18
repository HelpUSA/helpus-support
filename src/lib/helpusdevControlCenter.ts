/**
 * HelpUSDev Control Center — Server-Side Projection Store, RBAC, Device Auth & Intent Engine (R18)
 *
 * Implements the technical contract defined in HelpUSDev_R18_Control_Center_Contrato.md:
 * 1. Read-only operational projection (events, tasks, agents, overview with explicit stale indicator).
 * 2. Administrative Intent queue (helpusdev.intent.v1) with server-side session actor_id binding,
 *    CSRF validation, rate limiting, and optimistic concurrency (409 Conflict on state_version mismatch).
 * 3. Device-authenticated outbound-only sync ingestion (helpusdev.event.v1) with HMAC-SHA256 verification,
 *    anti-replay window, monotonic sequence tracking, gap detection, and idempotent batch replay cache.
 * 4. Strict secret/prompt/PII redaction enforcement.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { INITIAL_USERS, UserAccount } from './auth';

export type CanonicalTaskState =
  | 'created'
  | 'queued'
  | 'leased'
  | 'waiting_response'
  | 'validating'
  | 'completed'
  | 'retry_wait'
  | 'blocked'
  | 'awaiting_human'
  | 'failed'
  | 'cancelled';

export type IntentVerb =
  | 'pause'
  | 'resume'
  | 'reprioritize'
  | 'cancel'
  | 'request_diagnostics'
  | 'approve'
  | 'reject';

export type IntentStatus =
  | 'submitted'
  | 'validated'
  | 'accepted'
  | 'rejected'
  | 'applied'
  | 'expired';

export interface HelpUSDevEventV1 {
  schema?: 'helpusdev.event.v1';
  event_id: string;
  host_id: string;
  workspace_id: string;
  seq: number;
  workflow_id: string;
  task_id: string;
  correlation_id: string;
  event_type: string;
  occurred_at_utc: string;
  observed_at_utc: string;
  agent: string;
  status: string;
  summary_redacted: string;
  attempt_no: number;
  payload_sha256?: string;
}

export interface HelpUSDevTaskProjection {
  task_id: string;
  workflow_id: string;
  project_id: string;
  title: string;
  state: CanonicalTaskState;
  assigned_agent: string;
  risk_class: 'low' | 'medium' | 'high' | 'critical';
  last_event_seq: number;
  last_delivery_acked_utc?: string | null;
  last_model_reply_observed: string | null;
  last_output_validated: string | null;
  updated_at_utc: string;
  next_attempt_at_utc?: string | null;
  block_reason_redacted?: string | null;
  state_version: number;
}

export interface HelpUSDevAgentStatus {
  agent_id: string;
  display_name: string;
  role: 'cognitive_executor' | 'local_coordinator' | 'optional_standby';
  availability: 'online' | 'partial' | 'unavailable' | 'unknown';
  last_delivery_acked_utc: string | null;
  last_model_reply_observed_utc: string | null;
  last_output_validated_utc: string | null;
  last_heartbeat_utc: string | null;
  diagnostic_note_redacted: string;
}

export interface HelpUSDevIntentV1 {
  schema: 'helpusdev.intent.v1';
  intent_id: string;
  actor_id: string;
  actor_role: string;
  tenant_id: string;
  host_id: string;
  workspace_id: string;
  target_id: string;
  verb: IntentVerb;
  reason: string;
  issued_at_utc: string;
  expires_at_utc: string;
  nonce: string;
  expected_state_version: number;
  approval_scope?: string;
  signature: string;
  status: IntentStatus;
  host_ack_detail?: string;
  acked_at_utc?: string;
}

export interface ControlCenterState {
  state_version: number;
  last_sync_utc: string | null;
  last_seq_by_host: Record<string, number>;
  seq_gaps: Array<{ host_id: string; expected_seq: number; received_seq: number; detected_at_utc: string }>;
  events: HelpUSDevEventV1[];
  tasks: Record<string, HelpUSDevTaskProjection>;
  agents: Record<string, HelpUSDevAgentStatus>;
  intents: HelpUSDevIntentV1[];
  batch_idempotency_cache: Record<string, { processed_at_utc: string; accepted_count: number; duplicate_count: number; state_version: number }>;
  used_nonces: Record<string, number>;
}

const DEFAULT_STALE_THRESHOLD_SEC = 120;
const REPLAY_WINDOW_SEC = 300;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const ALLOWED_R18_REHEARSAL_VERBS: Set<IntentVerb> = new Set([
  'pause',
  'resume',
  'reprioritize',
  'request_diagnostics',
]);

const FORBIDDEN_SECRET_PATTERNS = [
  /AIza[0-9A-Za-z\-_]{20,}/,
  /sk-[0-9A-Za-z]{20,}/,
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
  /DATABASE_URL\s*=/i,
  /password\s*=\s*['"][^'"]+['"]/i,
];

const SERVER_SESSION_SECRET = process.env.HELPUSDEV_CC_SESSION_SECRET || 'r18-local-sovereign-session-hmac-key';
const DEVICE_SYNC_SECRET = process.env.HELPUSDEV_CC_DEVICE_SECRET || 'r18-local-sovereign-device-hmac-key';
const STATE_FILE_PATH = path.join(process.cwd(), '.helpusdev_control_center_state.json');

const rateLimitBuckets: Map<string, { count: number; resetAt: number }> = new Map();

function createInitialState(): ControlCenterState {
  return {
    state_version: 1,
    last_sync_utc: null,
    last_seq_by_host: {},
    seq_gaps: [],
    events: [],
    tasks: {},
    agents: {
      chatgpt: {
        agent_id: 'chatgpt',
        display_name: 'ChatGPT (6ad3f426...)',
        role: 'cognitive_executor',
        availability: 'online',
        last_delivery_acked_utc: null,
        last_model_reply_observed_utc: null,
        last_output_validated_utc: null,
        last_heartbeat_utc: null,
        diagnostic_note_redacted: 'Bidirecional ativo via AI Bridge Local.',
      },
      antigravity: {
        agent_id: 'antigravity',
        display_name: 'Antigravity + HelpUSDev (Host Local)',
        role: 'local_coordinator',
        availability: 'online',
        last_delivery_acked_utc: null,
        last_model_reply_observed_utc: null,
        last_output_validated_utc: null,
        last_heartbeat_utc: null,
        diagnostic_note_redacted: 'Single Owner do SQLite e executor local sob Trusted Workspace.',
      },
      gemini: {
        agent_id: 'gemini',
        display_name: 'Gemini Web (053eb2588ec43fc5)',
        role: 'cognitive_executor',
        availability: 'partial',
        last_delivery_acked_utc: null,
        last_model_reply_observed_utc: null,
        last_output_validated_utc: null,
        last_heartbeat_utc: null,
        diagnostic_note_redacted: 'Entrega DOM (button_click_confirmed) operacional; monitorando captura de resposta real.',
      },
      deepseek: {
        agent_id: 'deepseek',
        display_name: 'DeepSeek Web (5c4ea94a...)',
        role: 'cognitive_executor',
        availability: 'unavailable',
        last_delivery_acked_utc: null,
        last_model_reply_observed_utc: null,
        last_output_validated_utc: null,
        last_heartbeat_utc: null,
        diagnostic_note_redacted: 'Aba ausente (target_chat_tab_not_found); failover automático ativo.',
      },
      ai_helpus: {
        agent_id: 'ai_helpus',
        display_name: 'AI.HelpUS (5ª IA)',
        role: 'optional_standby',
        availability: 'unknown',
        last_delivery_acked_utc: null,
        last_model_reply_observed_utc: null,
        last_output_validated_utc: null,
        last_heartbeat_utc: null,
        diagnostic_note_redacted: 'Opcional e fora do caminho crítico.',
      },
    },
    intents: [],
    batch_idempotency_cache: {},
    used_nonces: {},
  };
}

export function loadControlCenterState(): ControlCenterState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      return JSON.parse(raw) as ControlCenterState;
    }
  } catch {
    // Fallback to clean state
  }
  return createInitialState();
}

export function saveControlCenterState(state: ControlCenterState): void {
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

export function resetControlCenterStateForTests(): ControlCenterState {
  const fresh = createInitialState();
  saveControlCenterState(fresh);
  rateLimitBuckets.clear();
  return fresh;
}

/**
 * Redacts sensitive paths, secrets, and raw tokens from summaries before storage.
 */
export function redactSensitiveSummary(input: string): { clean: string; hadSecretAttempt: boolean } {
  let text = String(input || '');
  let hadSecret = false;
  for (const pat of FORBIDDEN_SECRET_PATTERNS) {
    if (pat.test(text)) {
      hadSecret = true;
      text = text.replace(pat, '[REDACTED_SECRET]');
    }
  }
  // Redact absolute Windows user paths
  text = text.replace(/[A-Za-z]:\\Users\\[^\s"']+/g, '[REDACTED_USER_PATH]');
  return { clean: text.slice(0, 600), hadSecretAttempt: hadSecret };
}

/**
 * Issue a server-signed SuperAdmin session token (used for backend RBAC + tenant verification).
 */
export function issueServerSessionToken(userId: string, tenantId: string): string {
  const user = INITIAL_USERS.find((u) => u.id === userId);
  if (!user) throw new Error(`Unknown user_id: ${userId}`);
  const payload = JSON.stringify({
    sub: user.id,
    role: user.role,
    tenant_id: tenantId,
    allowed_tenants: user.allowedTenantIds,
    status: user.status,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const b64 = Buffer.from(payload, 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SESSION_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function issueCsrfToken(sessionToken: string): string {
  return crypto.createHmac('sha256', SERVER_SESSION_SECRET).update(`csrf:${sessionToken}`).digest('hex');
}

/**
 * Server-side RBAC + Tenant Isolation verification (R18-07 & R18-08).
 * Never trusts client-supplied email or role strings; verifies HMAC-signed session token
 * and checks the canonical user record on the server.
 */
export function verifySuperAdminRequest(headers: Record<string, string | undefined>): {
  ok: boolean;
  httpStatus: number;
  error?: string;
  actor?: UserAccount;
  tenantId?: string;
} {
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  const requestedTenant = headers['x-helpus-tenant-id'] || headers['X-HelpUS-Tenant-Id'] || 'helpus-support';

  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, httpStatus: 401, error: 'unauthenticated_missing_bearer_token' };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, httpStatus: 401, error: 'malformed_session_token' };
  }

  const [b64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SERVER_SESSION_SECRET).update(b64).digest('base64url');
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return { ok: false, httpStatus: 401, error: 'invalid_session_signature' };
  }

  let claims: { sub: string; role: string; tenant_id: string; exp: number };
  try {
    claims = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
  } catch {
    return { ok: false, httpStatus: 401, error: 'corrupted_session_claims' };
  }

  if (Math.floor(Date.now() / 1000) > claims.exp) {
    return { ok: false, httpStatus: 401, error: 'session_expired' };
  }

  // Look up authoritative server user account by ID (do not rely on email text)
  const serverUser = INITIAL_USERS.find((u) => u.id === claims.sub);
  if (!serverUser || serverUser.status !== 'active' || !serverUser.hasSupportAccess) {
    return { ok: false, httpStatus: 403, error: 'account_inactive_or_revoked' };
  }

  // R18-07: Strict role check on backend
  if (serverUser.role !== 'super_admin') {
    return {
      ok: false,
      httpStatus: 403,
      error: `rbac_denied_role_${serverUser.role}_not_super_admin`,
    };
  }

  // R18-08: Strict tenant isolation check
  const allowedSuperAdminTenants = new Set(['helpus-support', 'helpus-admin']);
  if (!allowedSuperAdminTenants.has(requestedTenant) || !serverUser.allowedTenantIds.includes('all')) {
    return {
      ok: false,
      httpStatus: 403,
      error: `tenant_isolation_denied_for_tenant_${requestedTenant}`,
    };
  }

  return { ok: true, httpStatus: 200, actor: serverUser, tenantId: requestedTenant };
}

/**
 * CSRF & Rate Limit enforcement for mutating SuperAdmin endpoints (R18-09).
 */
export function enforceCsrfAndRateLimit(
  actorId: string,
  sessionToken: string,
  csrfHeader: string | undefined,
  maxPerWindow: number = MAX_REQUESTS_PER_WINDOW
): { ok: boolean; httpStatus: number; error?: string } {
  const expectedCsrf = issueCsrfToken(sessionToken);
  if (!csrfHeader || csrfHeader !== expectedCsrf) {
    return { ok: false, httpStatus: 403, error: 'csrf_token_mismatch_or_missing' };
  }

  const now = Date.now();
  const bucket = rateLimitBuckets.get(actorId);
  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(actorId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true, httpStatus: 200 };
  }

  if (bucket.count >= maxPerWindow) {
    return { ok: false, httpStatus: 429, error: 'rate_limit_exceeded' };
  }
  bucket.count += 1;
  return { ok: true, httpStatus: 200 };
}

/**
 * Sign and verify Windows Host Device sync requests (outbound HTTPS from ai-bridge-local).
 */
export function signDevicePayload(hostId: string, timestampSec: number, nonce: string, bodyJson: string): string {
  const canonical = `${hostId}|${timestampSec}|${nonce}|${bodyJson}`;
  return crypto.createHmac('sha256', DEVICE_SYNC_SECRET).update(canonical).digest('hex');
}

export function verifyDeviceRequest(
  headers: Record<string, string | undefined>,
  bodyJson: string,
  state: ControlCenterState
): { ok: boolean; httpStatus: number; error?: string; hostId?: string } {
  const hostId = headers['x-helpusdev-host-id'] || '';
  const tsStr = headers['x-helpusdev-timestamp'] || '';
  const nonce = headers['x-helpusdev-nonce'] || '';
  const sig = headers['x-helpusdev-signature'] || '';

  if (!hostId || !tsStr || !nonce || !sig) {
    return { ok: false, httpStatus: 401, error: 'missing_device_auth_headers' };
  }

  const ts = Number(tsStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > REPLAY_WINDOW_SEC) {
    return { ok: false, httpStatus: 401, error: 'device_timestamp_outside_replay_window' };
  }

  if (state.used_nonces[nonce] && state.used_nonces[nonce] > nowSec - REPLAY_WINDOW_SEC) {
    return { ok: false, httpStatus: 409, error: 'device_nonce_replay_detected' };
  }

  const expectedSig = signDevicePayload(hostId, ts, nonce, bodyJson);
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return { ok: false, httpStatus: 401, error: 'invalid_device_hmac_signature' };
  }

  state.used_nonces[nonce] = nowSec;
  return { ok: true, httpStatus: 200, hostId };
}

/**
 * Ingest a batch of canonical events (helpusdev.event.v1) idempotently (R18-04, R18-05, R18-06, R18-09).
 */
export function ingestEventBatch(
  batchId: string,
  events: HelpUSDevEventV1[],
  taskSnapshots?: HelpUSDevTaskProjection[]
): {
  ok: boolean;
  httpStatus: number;
  cached: boolean;
  accepted_count: number;
  duplicate_count: number;
  seq_gaps_detected: number;
  state_version: number;
  error?: string;
} {
  const state = loadControlCenterState();

  // R18-06: Batch replay idempotency
  if (state.batch_idempotency_cache[batchId]) {
    const cached = state.batch_idempotency_cache[batchId];
    return {
      ok: true,
      httpStatus: 200,
      cached: true,
      accepted_count: cached.accepted_count,
      duplicate_count: cached.duplicate_count,
      seq_gaps_detected: 0,
      state_version: cached.state_version,
    };
  }

  const existingIds = new Set(state.events.map((e) => e.event_id));
  let accepted = 0;
  let duplicates = 0;
  let gapsDetected = 0;

  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  for (const ev of sorted) {
    if (existingIds.has(ev.event_id)) {
      duplicates += 1;
      continue;
    }

    const redaction = redactSensitiveSummary(ev.summary_redacted);
    if (redaction.hadSecretAttempt) {
      return {
        ok: false,
        httpStatus: 422,
        cached: false,
        accepted_count: 0,
        duplicate_count: 0,
        seq_gaps_detected: 0,
        state_version: state.state_version,
        error: `plaintext_secret_rejected_in_event_${ev.event_id}`,
      };
    }

    const lastSeq = state.last_seq_by_host[ev.host_id] || 0;
    if (lastSeq > 0 && ev.seq > lastSeq + 1) {
      state.seq_gaps.push({
        host_id: ev.host_id,
        expected_seq: lastSeq + 1,
        received_seq: ev.seq,
        detected_at_utc: new Date().toISOString(),
      });
      gapsDetected += 1;
    }
    if (ev.seq > lastSeq) {
      state.last_seq_by_host[ev.host_id] = ev.seq;
    }

    const sanitizedEvent: HelpUSDevEventV1 = {
      schema: 'helpusdev.event.v1',
      event_id: ev.event_id,
      host_id: ev.host_id,
      workspace_id: ev.workspace_id,
      seq: ev.seq,
      workflow_id: ev.workflow_id,
      task_id: ev.task_id,
      correlation_id: ev.correlation_id,
      event_type: ev.event_type,
      occurred_at_utc: ev.occurred_at_utc,
      observed_at_utc: new Date().toISOString(),
      agent: ev.agent,
      status: ev.status,
      summary_redacted: redaction.clean,
      attempt_no: ev.attempt_no,
      payload_sha256: ev.payload_sha256,
    };

    state.events.push(sanitizedEvent);
    existingIds.add(ev.event_id);
    accepted += 1;

    // Update agent observed timestamps without ever conflating delivery_acked with model_reply_observed
    const agentRec = state.agents[ev.agent];
    if (agentRec) {
      if (ev.event_type === 'message.delivery_acked') {
        agentRec.last_delivery_acked_utc = ev.occurred_at_utc;
      } else if (ev.event_type === 'message.model_reply_observed') {
        agentRec.last_model_reply_observed_utc = ev.occurred_at_utc;
        agentRec.availability = 'online';
      } else if (ev.event_type === 'task.output_validated') {
        agentRec.last_output_validated_utc = ev.occurred_at_utc;
      } else if (ev.event_type === 'worker.heartbeat') {
        agentRec.last_heartbeat_utc = ev.occurred_at_utc;
      } else if (ev.event_type === 'worker.offline') {
        agentRec.availability = 'unavailable';
      }
    }
  }

  if (Array.isArray(taskSnapshots)) {
    for (const snap of taskSnapshots) {
      state.tasks[snap.task_id] = {
        ...snap,
        block_reason_redacted: snap.block_reason_redacted
          ? redactSensitiveSummary(snap.block_reason_redacted).clean
          : null,
      };
    }
  }

  state.last_sync_utc = new Date().toISOString();
  state.state_version += 1;
  state.batch_idempotency_cache[batchId] = {
    processed_at_utc: state.last_sync_utc,
    accepted_count: accepted,
    duplicate_count: duplicates,
    state_version: state.state_version,
  };

  saveControlCenterState(state);
  return {
    ok: true,
    httpStatus: 200,
    cached: false,
    accepted_count: accepted,
    duplicate_count: duplicates,
    seq_gaps_detected: gapsDetected,
    state_version: state.state_version,
  };
}

/**
 * Submit a SuperAdmin administrative intent (helpusdev.intent.v1) with optimistic concurrency check (R18-10, R18-11).
 */
export function submitAdminIntent(params: {
  actor: UserAccount;
  tenantId: string;
  host_id: string;
  workspace_id: string;
  target_id: string;
  verb: IntentVerb;
  reason: string;
  nonce: string;
  expected_state_version: number;
  approval_scope?: string;
  step_up_token?: string;
}): { ok: boolean; httpStatus: number; error?: string; intent?: HelpUSDevIntentV1; current_state_version?: number } {
  const state = loadControlCenterState();

  // R18-11: Concurrent state version mismatch -> HTTP 409 Conflict
  if (params.expected_state_version !== state.state_version) {
    return {
      ok: false,
      httpStatus: 409,
      error: `state_version_conflict_expected_${params.expected_state_version}_actual_${state.state_version}`,
      current_state_version: state.state_version,
    };
  }

  if (!ALLOWED_R18_REHEARSAL_VERBS.has(params.verb)) {
    if (!params.step_up_token || !params.approval_scope) {
      return {
        ok: false,
        httpStatus: 403,
        error: `verb_${params.verb}_requires_step_up_token_and_explicit_scope_in_r18`,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 300_000).toISOString();
  const intentId = `intent-r18-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const sigPayload = `${intentId}|${params.actor.id}|${params.host_id}|${params.workspace_id}|${params.target_id}|${params.verb}|${params.expected_state_version}|${params.nonce}`;
  const signature = crypto.createHmac('sha256', DEVICE_SYNC_SECRET).update(sigPayload).digest('hex');

  const intent: HelpUSDevIntentV1 = {
    schema: 'helpusdev.intent.v1',
    intent_id: intentId,
    actor_id: params.actor.id, // Bound strictly from authenticated server session!
    actor_role: params.actor.role,
    tenant_id: params.tenantId,
    host_id: params.host_id,
    workspace_id: params.workspace_id,
    target_id: params.target_id,
    verb: params.verb,
    reason: redactSensitiveSummary(params.reason).clean,
    issued_at_utc: nowIso,
    expires_at_utc: expiresIso,
    nonce: params.nonce,
    expected_state_version: params.expected_state_version,
    approval_scope: params.approval_scope,
    signature,
    status: 'submitted',
  };

  state.intents.push(intent);
  state.state_version += 1;
  saveControlCenterState(state);
  return { ok: true, httpStatus: 201, intent, current_state_version: state.state_version };
}

/**
 * Compute overview with explicit stale indicator (R18-03).
 */
export function getControlCenterOverview(
  nowEpochMs: number = Date.now(),
  staleThresholdSec: number = DEFAULT_STALE_THRESHOLD_SEC
) {
  const state = loadControlCenterState();
  const tasksList = Object.values(state.tasks);

  let syncAgeSec: number | null = null;
  let isStale = true;
  if (state.last_sync_utc) {
    const syncMs = Date.parse(state.last_sync_utc);
    if (!Number.isNaN(syncMs)) {
      syncAgeSec = Math.max(0, Math.round((nowEpochMs - syncMs) / 1000));
      isStale = syncAgeSec > staleThresholdSec;
    }
  }

  return {
    state_version: state.state_version,
    last_sync_utc: state.last_sync_utc,
    sync_age_sec: syncAgeSec,
    stale_threshold_sec: staleThresholdSec,
    is_stale: isStale,
    stale_banner_message: isStale
      ? `DADOS DEFASADOS: Última sincronização há ${syncAgeSec ?? 'N/A'}s (limite: ${staleThresholdSec}s). O executor local continua operando autonomamente.`
      : 'SINCRONIZADO EM TEMPO REAL',
    counts: {
      active_tasks: tasksList.filter((t) => ['leased', 'waiting_response', 'validating'].includes(t.state)).length,
      queued_backlog: tasksList.filter((t) => ['created', 'queued', 'retry_wait'].includes(t.state)).length,
      blocked_tasks: tasksList.filter((t) => t.state === 'blocked').length,
      awaiting_human: tasksList.filter((t) => t.state === 'awaiting_human').length,
      completed_tasks: tasksList.filter((t) => t.state === 'completed').length,
      failed_tasks: tasksList.filter((t) => t.state === 'failed').length,
      total_events: state.events.length,
      seq_gaps: state.seq_gaps.length,
      pending_intents: state.intents.filter((i) => i.status === 'submitted').length,
    },
    agents: Object.values(state.agents),
  };
}
