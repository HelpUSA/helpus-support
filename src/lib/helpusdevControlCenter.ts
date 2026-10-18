/**
 * HelpUSDev Control Center — Transactional SQLite Store, Externalized HMAC Security,
 * Real SuperAdmin Auth, Per-(Host,Workspace) Sequence Gap Reconciliation & Intent Engine (R18.5)
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { INITIAL_USERS, UserAccount } from './auth';

// Built-in Node.js 22+/24+ synchronous SQLite driver with WAL & BEGIN IMMEDIATE support
// Lazy-loaded to avoid serverless build crashes on runtimes without node:sqlite
let _DatabaseSyncClass: any = null;
export function getDatabaseSync() {
  if (!_DatabaseSyncClass) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _DatabaseSyncClass = require('node:sqlite').DatabaseSync;
    } catch (e: any) {
      throw new ControlCenterStorageIntegrityError(`node:sqlite is unavailable in this environment: ${e?.message || e}`);
    }
  }
  return _DatabaseSyncClass;
}

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

export interface SeqGapRecord {
  host_id: string;
  workspace_id: string;
  expected_seq: number;
  received_seq: number;
  reconciled: boolean;
  detected_at_utc: string;
  reconciled_at_utc?: string | null;
}

export interface ControlCenterState {
  state_version: number;
  last_sync_utc: string | null;
  last_seq_by_host: Record<string, number>;
  seq_gaps: SeqGapRecord[];
  events: HelpUSDevEventV1[];
  tasks: Record<string, HelpUSDevTaskProjection>;
  agents: Record<string, HelpUSDevAgentStatus>;
  intents: HelpUSDevIntentV1[];
  batch_idempotency_cache: Record<
    string,
    {
      processed_at_utc: string;
      accepted_count: number;
      duplicate_count: number;
      accepted_event_ids: string[];
      state_version: number;
    }
  >;
  used_nonces: Record<string, number>;
  rate_limit_buckets: Record<string, { count: number; resetAt: number }>;
}

export class MissingControlCenterSecretError extends Error {
  public readonly httpStatus = 503;
  public readonly code = 'missing_required_hmac_secrets';
  constructor(detail: string) {
    super(`missing_required_hmac_secrets:${detail}`);
    this.name = 'MissingControlCenterSecretError';
  }
}

export class ControlCenterStorageIntegrityError extends Error {
  public readonly httpStatus = 500;
  public readonly code = 'storage_corruption_detected_fail_closed';
  constructor(detail: string) {
    super(`storage_corruption_detected_fail_closed:${detail}`);
    this.name = 'ControlCenterStorageIntegrityError';
  }
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

// Deprecated fallback strings from early pilot — explicitly revoked and forbidden
const REVOKED_LEGACY_SECRETS = new Set([
  'r18-local-sovereign-session-hmac-key',
  'r18-local-sovereign-device-hmac-key',
  'r18-local-sovereign-device-hmac-key-v2-rotated',
]);

export interface ExternalSecretsBundle {
  sessionSecret: string;
  csrfSecret: string;
  intentSigningSecret: string;
  deviceSecretPrimary: string;
  deviceSecretRotatedV2: string;
}

/**
 * P0 & R19 Priority 4 Remediation: Never use hardcoded fallback HMAC secrets in repository code,
 * and enforce strict cryptographic separation by purpose across all 5 secrets.
 * Fails closed (HTTP 503) if secrets are missing, short, match revoked legacy strings, or reuse keys across purposes.
 */
export function getRequiredSecrets(): ExternalSecretsBundle {
  if (process.env.HELPUSDEV_CC_FORCE_MISSING_SECRETS === '1') {
    throw new MissingControlCenterSecretError('forced_missing_secrets_test_mode');
  }

  let sessionSecret = process.env.HELPUSDEV_CC_SESSION_SECRET || '';
  let csrfSecret = process.env.HELPUSDEV_CC_CSRF_SECRET || '';
  let intentSigningSecret = process.env.HELPUSDEV_CC_INTENT_SECRET || '';
  let deviceSecretPrimary = process.env.HELPUSDEV_CC_DEVICE_SECRET || '';
  let deviceSecretRotatedV2 = process.env.HELPUSDEV_CC_DEVICE_SECRET_V2 || '';

  if (!sessionSecret || !csrfSecret || !intentSigningSecret || !deviceSecretPrimary || !deviceSecretRotatedV2) {
    const secretsFile =
      process.env.HELPUSDEV_CC_SECRETS_FILE || 'D:/AntiG/ai-bridge-local/.helpusdev_secrets.json';
    if (fs.existsSync(secretsFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(secretsFile, 'utf-8'));
        sessionSecret = sessionSecret || String(parsed.session_secret || '');
        csrfSecret = csrfSecret || String(parsed.csrf_secret || '');
        intentSigningSecret = intentSigningSecret || String(parsed.intent_signing_secret || '');
        deviceSecretPrimary = deviceSecretPrimary || String(parsed.device_secret_primary || '');
        deviceSecretRotatedV2 = deviceSecretRotatedV2 || String(parsed.device_secret_rotated_v2 || '');
      } catch (err: any) {
        throw new MissingControlCenterSecretError(`unreadable_external_secrets_file:${err?.message || err}`);
      }
    }
  }

  const entries = [
    ['session_secret', sessionSecret],
    ['csrf_secret', csrfSecret],
    ['intent_signing_secret', intentSigningSecret],
    ['device_secret_primary', deviceSecretPrimary],
    ['device_secret_rotated_v2', deviceSecretRotatedV2],
  ] as const;

  for (const [label, val] of entries) {
    if (!val || val.length < 32) {
      throw new MissingControlCenterSecretError(`${label}_missing_or_shorter_than_32_chars`);
    }
    if (REVOKED_LEGACY_SECRETS.has(val)) {
      throw new MissingControlCenterSecretError(`${label}_uses_revoked_legacy_fallback_key`);
    }
  }

  const uniqueKeys = new Set(entries.map(([, v]) => v));
  if (uniqueKeys.size !== entries.length) {
    throw new MissingControlCenterSecretError('hmac_key_reuse_across_purposes_forbidden');
  }

  return {
    sessionSecret,
    csrfSecret,
    intentSigningSecret,
    deviceSecretPrimary,
    deviceSecretRotatedV2,
  };
}

export interface DeviceKeyRecord {
  key_id: string;
  secret: string;
  expires_at_sec: number;
  revoked: boolean;
}

export function getDeviceKeyring(): Record<string, DeviceKeyRecord> {
  const secrets = getRequiredSecrets();
  return {
    'key-r18-primary': {
      key_id: 'key-r18-primary',
      secret: secrets.deviceSecretPrimary,
      expires_at_sec: 4102444800,
      revoked: false,
    },
    'key-r18-rotated-v2': {
      key_id: 'key-r18-rotated-v2',
      secret: secrets.deviceSecretRotatedV2,
      expires_at_sec: 4102444800,
      revoked: false,
    },
    'key-r18-expired': {
      key_id: 'key-r18-expired',
      secret: crypto.createHmac('sha256', secrets.deviceSecretPrimary).update('expired-key-purpose').digest('hex'),
      expires_at_sec: 1700000000,
      revoked: false,
    },
    'key-r18-revoked': {
      key_id: 'key-r18-revoked',
      secret: crypto.createHmac('sha256', secrets.deviceSecretPrimary).update('revoked-key-purpose').digest('hex'),
      expires_at_sec: 4102444800,
      revoked: true,
    },
  };
}

export function getControlCenterSqlitePath(): string {
  return process.env.HELPUSDEV_CC_SQLITE_PATH || path.join(process.cwd(), '.helpusdev_control_center.sqlite');
}

function defaultAgentsMap(): Record<string, HelpUSDevAgentStatus> {
  return {
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
  };
}

/**
 * P1 & R19 Priority 2 Remediation: Open transactional SQLite database with WAL + busy_timeout on sovereign Node host.
 * Fails closed if executed in an ephemeral Vercel serverless environment without a shared remote transactional DB URL,
 * and fails closed on file corruption (never silently recreates empty state).
 */
export function openControlCenterDb() {
  const isServerless =
    process.env.VERCEL === '1' || process.env.HELPUSDEV_CC_SIMULATE_VERCEL_SERVERLESS === '1';
  const hasRemoteSharedDb = Boolean(
    process.env.HELPUSDEV_CC_REMOTE_DB_URL || process.env.POSTGRES_URL || process.env.TURSO_DATABASE_URL
  );
  if (isServerless && !hasRemoteSharedDb) {
    throw new ControlCenterStorageIntegrityError(
      'serverless_ephemeral_sqlite_blocked_require_shared_transactional_db'
    );
  }

  const dbPath = getControlCenterSqlitePath();
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    if (stat.size > 0) {
      const fd = fs.openSync(dbPath, 'r');
      const headerBuf = Buffer.alloc(16);
      const bytesRead = fs.readSync(fd, headerBuf, 0, 16, 0);
      fs.closeSync(fd);
      const magic = headerBuf.toString('utf-8', 0, 15);
      if (bytesRead < 16 || magic !== 'SQLite format 3') {
        throw new ControlCenterStorageIntegrityError(`invalid_sqlite_magic_header_in_${path.basename(dbPath)}`);
      }
    }
  }

  let db: any;
  try {
    const DatabaseSync = getDatabaseSync();
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = FULL;');
    db.exec('PRAGMA busy_timeout = 5000;');
    const qc = db.prepare('PRAGMA quick_check;').get() as { quick_check?: string } | undefined;
    if (qc && qc.quick_check && qc.quick_check !== 'ok') {
      db.close();
      throw new ControlCenterStorageIntegrityError(`sqlite_quick_check_failed:${qc.quick_check}`);
    }
  } catch (err: any) {
    if (err instanceof ControlCenterStorageIntegrityError) throw err;
    throw new ControlCenterStorageIntegrityError(err?.message || String(err));
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS cc_meta (
      key TEXT PRIMARY KEY,
      int_val INTEGER,
      text_val TEXT
    );
    CREATE TABLE IF NOT EXISTS cc_events (
      event_id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      workflow_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at_utc TEXT NOT NULL,
      observed_at_utc TEXT NOT NULL,
      agent TEXT NOT NULL,
      status TEXT NOT NULL,
      summary_redacted TEXT NOT NULL,
      attempt_no INTEGER NOT NULL,
      payload_sha256 TEXT,
      UNIQUE(host_id, workspace_id, seq)
    );
    CREATE TABLE IF NOT EXISTS cc_seq_tracker (
      host_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      last_seq INTEGER NOT NULL,
      PRIMARY KEY(host_id, workspace_id)
    );
    CREATE TABLE IF NOT EXISTS cc_seq_gaps (
      gap_id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      expected_seq INTEGER NOT NULL,
      received_seq INTEGER NOT NULL,
      reconciled INTEGER NOT NULL DEFAULT 0,
      detected_at_utc TEXT NOT NULL,
      reconciled_at_utc TEXT,
      UNIQUE(host_id, workspace_id, expected_seq)
    );
    CREATE TABLE IF NOT EXISTS cc_tasks (
      task_id TEXT PRIMARY KEY,
      json_data TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cc_agents (
      agent_id TEXT PRIMARY KEY,
      json_data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cc_intents (
      intent_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      json_data TEXT NOT NULL,
      issued_at_utc TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cc_batches (
      batch_id TEXT PRIMARY KEY,
      processed_at_utc TEXT NOT NULL,
      accepted_count INTEGER NOT NULL,
      duplicate_count INTEGER NOT NULL,
      accepted_event_ids_json TEXT NOT NULL,
      state_version INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cc_nonces (
      nonce TEXT PRIMARY KEY,
      used_at_sec INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cc_rate_limits (
      actor_id TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cc_sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      issued_at_sec INTEGER NOT NULL,
      expires_at_sec INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      revoked_reason TEXT
    );
    CREATE TABLE IF NOT EXISTS cc_user_privileges (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      has_support_access INTEGER NOT NULL DEFAULT 1,
      allowed_tenants_json TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL
    );
  `);

  // Seed initial metadata, default agents, and server-side user privileges inside an immediate transaction if not present
  const verRow = db.prepare("SELECT int_val FROM cc_meta WHERE key = 'state_version'").get();
  const privCountRow = db.prepare('SELECT COUNT(*) as cnt FROM cc_user_privileges').get() as { cnt: number };
  if (!verRow || Number(privCountRow.cnt) === 0) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.prepare("INSERT OR IGNORE INTO cc_meta (key, int_val, text_val) VALUES ('state_version', 1, NULL)").run();
      db.prepare("INSERT OR IGNORE INTO cc_meta (key, int_val, text_val) VALUES ('last_sync_utc', NULL, NULL)").run();
      const agents = defaultAgentsMap();
      const insAgent = db.prepare('INSERT OR IGNORE INTO cc_agents (agent_id, json_data) VALUES (?, ?)');
      for (const [aid, aobj] of Object.entries(agents)) {
        insAgent.run(aid, JSON.stringify(aobj));
      }
      const insPriv = db.prepare(
        'INSERT OR IGNORE INTO cc_user_privileges (user_id, email, role, status, has_support_access, allowed_tenants_json, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      const nowIso = new Date().toISOString();
      for (const u of INITIAL_USERS) {
        insPriv.run(
          u.id,
          u.email.toLowerCase(),
          u.role,
          u.status,
          u.hasSupportAccess ? 1 : 0,
          JSON.stringify(u.allowedTenantIds || []),
          nowIso
        );
      }
      db.exec('COMMIT;');
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  }

  return db;
}

function withTransaction<T>(fn: (db: ReturnType<typeof openControlCenterDb>) => T): T {
  const db = openControlCenterDb();
  try {
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn(db);
      db.exec('COMMIT;');
      return result;
    } catch (innerErr) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback error
      }
      throw innerErr;
    }
  } finally {
    db.close();
  }
}

/**
 * Load canonical state snapshot from transactional SQLite store.
 * Throws ControlCenterStorageIntegrityError if the underlying database is corrupted.
 */
export function loadControlCenterState(): ControlCenterState {
  const db = openControlCenterDb();
  try {
    const verRow = db.prepare("SELECT int_val FROM cc_meta WHERE key = 'state_version'").get() as { int_val: number } | undefined;
    const syncRow = db.prepare("SELECT text_val FROM cc_meta WHERE key = 'last_sync_utc'").get() as { text_val: string | null } | undefined;

    const seqRows = db.prepare('SELECT host_id, workspace_id, last_seq FROM cc_seq_tracker').all() as Array<{
      host_id: string;
      workspace_id: string;
      last_seq: number;
    }>;
    const lastSeqByHost: Record<string, number> = {};
    for (const r of seqRows) {
      lastSeqByHost[`${r.host_id}:${r.workspace_id}`] = r.last_seq;
      if ((lastSeqByHost[r.host_id] || 0) < r.last_seq) {
        lastSeqByHost[r.host_id] = r.last_seq;
      }
    }

    const gapRows = db
      .prepare(
        'SELECT host_id, workspace_id, expected_seq, received_seq, reconciled, detected_at_utc, reconciled_at_utc FROM cc_seq_gaps ORDER BY gap_id ASC'
      )
      .all() as Array<any>;
    const seqGaps: SeqGapRecord[] = gapRows.map((g) => ({
      host_id: g.host_id,
      workspace_id: g.workspace_id,
      expected_seq: Number(g.expected_seq),
      received_seq: Number(g.received_seq),
      reconciled: Boolean(g.reconciled),
      detected_at_utc: g.detected_at_utc,
      reconciled_at_utc: g.reconciled_at_utc,
    }));

    const eventRows = db.prepare('SELECT * FROM cc_events ORDER BY seq ASC').all() as Array<any>;
    const events: HelpUSDevEventV1[] = eventRows.map((e) => ({
      schema: 'helpusdev.event.v1',
      event_id: e.event_id,
      host_id: e.host_id,
      workspace_id: e.workspace_id,
      seq: Number(e.seq),
      workflow_id: e.workflow_id,
      task_id: e.task_id,
      correlation_id: e.correlation_id,
      event_type: e.event_type,
      occurred_at_utc: e.occurred_at_utc,
      observed_at_utc: e.observed_at_utc,
      agent: e.agent,
      status: e.status,
      summary_redacted: e.summary_redacted,
      attempt_no: Number(e.attempt_no),
      payload_sha256: e.payload_sha256 || undefined,
    }));

    const taskRows = db.prepare('SELECT task_id, json_data FROM cc_tasks').all() as Array<{ task_id: string; json_data: string }>;
    const tasks: Record<string, HelpUSDevTaskProjection> = {};
    for (const t of taskRows) {
      tasks[t.task_id] = JSON.parse(t.json_data);
    }

    const agentRows = db.prepare('SELECT agent_id, json_data FROM cc_agents').all() as Array<{ agent_id: string; json_data: string }>;
    const agents: Record<string, HelpUSDevAgentStatus> = defaultAgentsMap();
    for (const a of agentRows) {
      agents[a.agent_id] = JSON.parse(a.json_data);
    }

    const intentRows = db.prepare('SELECT json_data FROM cc_intents ORDER BY issued_at_utc ASC').all() as Array<{ json_data: string }>;
    const intents: HelpUSDevIntentV1[] = intentRows.map((i) => JSON.parse(i.json_data));

    const batchRows = db.prepare('SELECT * FROM cc_batches').all() as Array<any>;
    const batchCache: ControlCenterState['batch_idempotency_cache'] = {};
    for (const b of batchRows) {
      batchCache[b.batch_id] = {
        processed_at_utc: b.processed_at_utc,
        accepted_count: Number(b.accepted_count),
        duplicate_count: Number(b.duplicate_count),
        accepted_event_ids: JSON.parse(b.accepted_event_ids_json || '[]'),
        state_version: Number(b.state_version),
      };
    }

    const nonceRows = db.prepare('SELECT nonce, used_at_sec FROM cc_nonces').all() as Array<{ nonce: string; used_at_sec: number }>;
    const usedNonces: Record<string, number> = {};
    for (const n of nonceRows) {
      usedNonces[n.nonce] = Number(n.used_at_sec);
    }

    const rlRows = db.prepare('SELECT actor_id, count, reset_at_ms FROM cc_rate_limits').all() as Array<{
      actor_id: string;
      count: number;
      reset_at_ms: number;
    }>;
    const rateLimits: Record<string, { count: number; resetAt: number }> = {};
    for (const rl of rlRows) {
      rateLimits[rl.actor_id] = { count: Number(rl.count), resetAt: Number(rl.reset_at_ms) };
    }

    return {
      state_version: verRow ? Number(verRow.int_val) : 1,
      last_sync_utc: syncRow ? syncRow.text_val : null,
      last_seq_by_host: lastSeqByHost,
      seq_gaps: seqGaps,
      events,
      tasks,
      agents,
      intents,
      batch_idempotency_cache: batchCache,
      used_nonces: usedNonces,
      rate_limit_buckets: rateLimits,
    };
  } finally {
    db.close();
  }
}

export function closeControlCenterDb(): void {
  // Each SQLite operation opens and closes its DatabaseSync handle deterministically.
}

export function resetControlCenterStateForTests(): ControlCenterState {
  const dbPath = getControlCenterSqlitePath();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${dbPath}${suffix}`;
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
  return loadControlCenterState();
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
  text = text.replace(/[A-Za-z]:\\Users\\[^\s"']+/g, '[REDACTED_USER_PATH]');
  return { clean: text.slice(0, 600), hadSecretAttempt: hadSecret };
}

/**
 * P1 & R19 Priority 3 Remediation: Real SuperAdmin authentication bound to server-side privilege registry
 * (cc_user_privileges) and stateful session ledger (cc_sessions).
 * Never trusts client-supplied email alone; requires matching server identity + active status + super_admin role.
 */
export function authenticateSuperAdminCredentials(
  email: string,
  userIdOrCredential: string,
  tenantId: string = 'helpus-support'
): {
  ok: boolean;
  httpStatus: number;
  error?: string;
  sessionToken?: string;
  csrfToken?: string;
  actor?: UserAccount;
} {
  let secrets: ExternalSecretsBundle;
  try {
    secrets = getRequiredSecrets();
  } catch (err: any) {
    return { ok: false, httpStatus: 503, error: err?.message || 'missing_required_hmac_secrets' };
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedCred = String(userIdOrCredential || '').trim();
  const baseUser = INITIAL_USERS.find(
    (u) => u.email.toLowerCase() === normalizedEmail || u.googleEmail?.toLowerCase() === normalizedEmail
  );
  if (!baseUser || !normalizedCred || (baseUser.id !== normalizedCred && baseUser.username !== normalizedCred)) {
    return { ok: false, httpStatus: 401, error: 'invalid_credentials' };
  }

  // Consult live server-side privilege state in SQLite (cc_user_privileges)
  const db = openControlCenterDb();
  let privRow:
    | {
        user_id: string;
        email: string;
        role: string;
        status: string;
        has_support_access: number;
        allowed_tenants_json: string;
      }
    | undefined;
  try {
    privRow = db
      .prepare('SELECT * FROM cc_user_privileges WHERE user_id = ?')
      .get(baseUser.id) as any;
  } finally {
    db.close();
  }

  const effectiveRole = (privRow?.role || baseUser.role) as UserAccount['role'];
  const effectiveStatus = (privRow?.status || baseUser.status) as UserAccount['status'];
  const effectiveSupportAccess = privRow ? Boolean(privRow.has_support_access) : baseUser.hasSupportAccess;
  const effectiveAllowedTenants: string[] = privRow
    ? JSON.parse(privRow.allowed_tenants_json || '[]')
    : baseUser.allowedTenantIds;

  if (effectiveStatus !== 'active' || !effectiveSupportAccess) {
    return { ok: false, httpStatus: 403, error: 'account_inactive_or_revoked' };
  }
  if (effectiveRole !== 'super_admin') {
    return { ok: false, httpStatus: 403, error: `rbac_denied_role_${effectiveRole}_not_super_admin` };
  }

  const sessionToken = issueServerSessionToken(baseUser.id, tenantId, 3600, secrets.sessionSecret);
  const csrfToken = issueCsrfToken(sessionToken, secrets.csrfSecret);
  const effectiveActor: UserAccount = {
    ...baseUser,
    role: effectiveRole,
    status: effectiveStatus,
    hasSupportAccess: effectiveSupportAccess,
    allowedTenantIds: effectiveAllowedTenants,
  };
  return {
    ok: true,
    httpStatus: 200,
    sessionToken,
    csrfToken,
    actor: effectiveActor,
  };
}

export function issueServerSessionToken(
  userId: string,
  tenantId: string,
  ttlSec: number = 3600,
  explicitSecret?: string
): string {
  const secret = explicitSecret || getRequiredSecrets().sessionSecret;
  const user = INITIAL_USERS.find((u) => u.id === userId);
  if (!user) throw new Error(`Unknown user_id: ${userId}`);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ttlSec;
  const jti = `sess-${nowSec}-${crypto.randomBytes(6).toString('hex')}`;

  withTransaction((db) => {
    db.prepare(
      'INSERT INTO cc_sessions (session_id, user_id, tenant_id, issued_at_sec, expires_at_sec, revoked) VALUES (?, ?, ?, ?, ?, 0)'
    ).run(jti, user.id, tenantId, nowSec, expSec);
  });

  const payload = JSON.stringify({
    jti,
    sub: user.id,
    role: user.role,
    tenant_id: tenantId,
    allowed_tenants: user.allowedTenantIds,
    status: user.status,
    iat: nowSec,
    exp: expSec,
  });
  const b64 = Buffer.from(payload, 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function revokeSuperAdminSession(sessionIdOrToken: string, reason: string = 'manual_revocation'): boolean {
  let jti = sessionIdOrToken;
  if (sessionIdOrToken.includes('.')) {
    try {
      const [b64] = sessionIdOrToken.split('.');
      const parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
      if (parsed.jti) jti = String(parsed.jti);
    } catch {
      // treat as raw session_id
    }
  }
  return withTransaction((db) => {
    const res = db
      .prepare('UPDATE cc_sessions SET revoked = 1, revoked_reason = ? WHERE session_id = ?')
      .run(reason, jti);
    return res.changes > 0;
  });
}

export function updateControlCenterUserPrivilege(
  userId: string,
  updates: {
    role?: UserAccount['role'];
    status?: UserAccount['status'];
    hasSupportAccess?: boolean;
    allowedTenantIds?: string[];
  }
): boolean {
  return withTransaction((db) => {
    const current = db.prepare('SELECT * FROM cc_user_privileges WHERE user_id = ?').get(userId) as any;
    if (!current) return false;
    const nextRole = updates.role ?? current.role;
    const nextStatus = updates.status ?? current.status;
    const nextSupport =
      updates.hasSupportAccess !== undefined ? (updates.hasSupportAccess ? 1 : 0) : Number(current.has_support_access);
    const nextTenants = updates.allowedTenantIds
      ? JSON.stringify(updates.allowedTenantIds)
      : current.allowed_tenants_json;
    db.prepare(
      'UPDATE cc_user_privileges SET role = ?, status = ?, has_support_access = ?, allowed_tenants_json = ?, updated_at_utc = ? WHERE user_id = ?'
    ).run(nextRole, nextStatus, nextSupport, nextTenants, new Date().toISOString(), userId);
    return true;
  });
}

export function issueCsrfToken(sessionToken: string, explicitSecret?: string): string {
  const secret = explicitSecret || getRequiredSecrets().csrfSecret;
  return crypto.createHmac('sha256', secret).update(`csrf:${sessionToken}`).digest('hex');
}

/**
 * Server-side RBAC + Tenant Isolation + Session Revocation + Live Privilege Verification (R18-07, R18-08 & R19 Priority 3).
 */
export function verifySuperAdminRequest(headers: Record<string, string | undefined>): {
  ok: boolean;
  httpStatus: number;
  error?: string;
  actor?: UserAccount;
  tenantId?: string;
} {
  let secrets: ExternalSecretsBundle;
  try {
    secrets = getRequiredSecrets();
  } catch (err: any) {
    return { ok: false, httpStatus: 503, error: err?.message || 'missing_required_hmac_secrets' };
  }

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
  const expectedSig = crypto.createHmac('sha256', secrets.sessionSecret).update(b64).digest('base64url');
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return { ok: false, httpStatus: 401, error: 'invalid_session_signature' };
  }

  let claims: { jti?: string; sub: string; role: string; tenant_id: string; exp: number };
  try {
    claims = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
  } catch {
    return { ok: false, httpStatus: 401, error: 'corrupted_session_claims' };
  }

  if (Math.floor(Date.now() / 1000) > claims.exp) {
    return { ok: false, httpStatus: 401, error: 'session_expired' };
  }

  const baseUser = INITIAL_USERS.find((u) => u.id === claims.sub);
  if (!baseUser) {
    return { ok: false, httpStatus: 403, error: 'account_inactive_or_revoked' };
  }

  // Verify live session revocation (cc_sessions) and dynamic privilege state (cc_user_privileges)
  const db = openControlCenterDb();
  let sessRow: { revoked: number; revoked_reason?: string } | undefined;
  let privRow:
    | {
        role: string;
        status: string;
        has_support_access: number;
        allowed_tenants_json: string;
      }
    | undefined;
  try {
    if (claims.jti) {
      sessRow = db.prepare('SELECT revoked, revoked_reason FROM cc_sessions WHERE session_id = ?').get(claims.jti) as any;
    }
    privRow = db.prepare('SELECT * FROM cc_user_privileges WHERE user_id = ?').get(claims.sub) as any;
  } finally {
    db.close();
  }

  if (claims.jti && (!sessRow || Number(sessRow.revoked) === 1)) {
    return { ok: false, httpStatus: 401, error: 'session_revoked' };
  }

  const effectiveRole = (privRow?.role || baseUser.role) as UserAccount['role'];
  const effectiveStatus = (privRow?.status || baseUser.status) as UserAccount['status'];
  const effectiveSupportAccess = privRow ? Boolean(privRow.has_support_access) : baseUser.hasSupportAccess;
  const effectiveAllowedTenants: string[] = privRow
    ? JSON.parse(privRow.allowed_tenants_json || '[]')
    : baseUser.allowedTenantIds;

  if (effectiveStatus !== 'active' || !effectiveSupportAccess) {
    return { ok: false, httpStatus: 403, error: 'account_inactive_or_revoked' };
  }

  if (effectiveRole !== 'super_admin') {
    return {
      ok: false,
      httpStatus: 403,
      error: `rbac_denied_role_${effectiveRole}_not_super_admin`,
    };
  }

  const allowedSuperAdminTenants = new Set(['helpus-support', 'helpus-admin']);
  if (!allowedSuperAdminTenants.has(requestedTenant) || !effectiveAllowedTenants.includes('all')) {
    return {
      ok: false,
      httpStatus: 403,
      error: `tenant_isolation_denied_for_tenant_${requestedTenant}`,
    };
  }

  const effectiveActor: UserAccount = {
    ...baseUser,
    role: effectiveRole,
    status: effectiveStatus,
    hasSupportAccess: effectiveSupportAccess,
    allowedTenantIds: effectiveAllowedTenants,
  };
  return { ok: true, httpStatus: 200, actor: effectiveActor, tenantId: requestedTenant };
}

/**
 * CSRF & Transactional Rate Limit enforcement for mutating SuperAdmin endpoints (R18-09).
 */
export function enforceCsrfAndRateLimit(
  actorId: string,
  sessionToken: string,
  csrfHeader: string | undefined,
  maxPerWindow: number = MAX_REQUESTS_PER_WINDOW
): { ok: boolean; httpStatus: number; error?: string } {
  let expectedCsrf: string;
  try {
    expectedCsrf = issueCsrfToken(sessionToken);
  } catch (err: any) {
    return { ok: false, httpStatus: 503, error: err?.message || 'missing_required_hmac_secrets' };
  }

  if (!csrfHeader || csrfHeader !== expectedCsrf) {
    return { ok: false, httpStatus: 403, error: 'csrf_token_mismatch_or_missing' };
  }

  return withTransaction((db) => {
    const now = Date.now();
    const row = db
      .prepare('SELECT count, reset_at_ms FROM cc_rate_limits WHERE actor_id = ?')
      .get(actorId) as { count: number; reset_at_ms: number } | undefined;

    if (!row || now > Number(row.reset_at_ms)) {
      db.prepare(
        'INSERT INTO cc_rate_limits (actor_id, count, reset_at_ms) VALUES (?, 1, ?) ON CONFLICT(actor_id) DO UPDATE SET count = 1, reset_at_ms = excluded.reset_at_ms'
      ).run(actorId, now + RATE_LIMIT_WINDOW_MS);
      return { ok: true, httpStatus: 200 };
    }

    if (Number(row.count) >= maxPerWindow) {
      return { ok: false, httpStatus: 429, error: 'rate_limit_exceeded' };
    }

    db.prepare('UPDATE cc_rate_limits SET count = count + 1 WHERE actor_id = ?').run(actorId);
    return { ok: true, httpStatus: 200 };
  });
}

/**
 * Sign and verify Windows Host Device sync requests using externalized keyring.
 */
export function signDevicePayload(
  hostId: string,
  timestampSec: number,
  nonce: string,
  bodyJson: string,
  keyId: string = 'key-r18-primary'
): string {
  const keyring = getDeviceKeyring();
  const keyRec = keyring[keyId] || keyring['key-r18-primary'];
  const canonical = `${keyId}|${hostId}|${timestampSec}|${nonce}|${bodyJson}`;
  return crypto.createHmac('sha256', keyRec.secret).update(canonical).digest('hex');
}

export function verifyDeviceRequest(
  headers: Record<string, string | undefined>,
  bodyJson: string
): { ok: boolean; httpStatus: number; error?: string; hostId?: string; keyId?: string } {
  let keyring: Record<string, DeviceKeyRecord>;
  try {
    keyring = getDeviceKeyring();
  } catch (err: any) {
    return { ok: false, httpStatus: 503, error: err?.message || 'missing_required_hmac_secrets' };
  }

  const hostId = headers['x-helpusdev-host-id'] || '';
  const tsStr = headers['x-helpusdev-timestamp'] || '';
  const nonce = headers['x-helpusdev-nonce'] || '';
  const sig = headers['x-helpusdev-signature'] || '';
  const keyId = headers['x-helpusdev-key-id'] || 'key-r18-primary';

  if (!hostId || !tsStr || !nonce || !sig) {
    return { ok: false, httpStatus: 401, error: 'missing_device_auth_headers' };
  }

  const keyRec = keyring[keyId];
  if (!keyRec) {
    return { ok: false, httpStatus: 401, error: 'unknown_device_key_id' };
  }
  if (keyRec.revoked) {
    return { ok: false, httpStatus: 401, error: 'device_key_revoked' };
  }

  const ts = Number(tsStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > keyRec.expires_at_sec) {
    return { ok: false, httpStatus: 401, error: 'device_key_expired' };
  }
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > REPLAY_WINDOW_SEC) {
    return { ok: false, httpStatus: 401, error: 'device_timestamp_outside_replay_window' };
  }

  const expectedSig = signDevicePayload(hostId, ts, nonce, bodyJson, keyId);
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return { ok: false, httpStatus: 401, error: 'invalid_device_hmac_signature' };
  }

  // Atomic nonce anti-replay check & insert inside SQLite IMMEDIATE transaction
  return withTransaction((db) => {
    db.prepare('DELETE FROM cc_nonces WHERE used_at_sec <= ?').run(nowSec - REPLAY_WINDOW_SEC);
    const existing = db.prepare('SELECT nonce FROM cc_nonces WHERE nonce = ?').get(nonce);
    if (existing) {
      return { ok: false, httpStatus: 409, error: 'device_nonce_replay_detected' };
    }
    db.prepare('INSERT INTO cc_nonces (nonce, used_at_sec) VALUES (?, ?)').run(nonce, nowSec);
    return { ok: true, httpStatus: 200, hostId, keyId };
  });
}

/**
 * Ingest a batch of canonical events (helpusdev.event.v1) inside a single atomic SQLite transaction.
 * Tracks monotonic sequence per (host_id, workspace_id), detects gaps, reconciles out-of-order gap fills,
 * and returns durable_persisted=true only after SQLite transaction commits.
 */
export function ingestEventBatch(
  batchId: string,
  events: HelpUSDevEventV1[],
  taskSnapshots?: HelpUSDevTaskProjection[]
): {
  ok: boolean;
  httpStatus: number;
  cached: boolean;
  durable_persisted: boolean;
  accepted_count: number;
  duplicate_count: number;
  accepted_event_ids: string[];
  seq_gaps_detected: number;
  seq_gaps_reconciled: number;
  state_version: number;
  error?: string;
} {
  // Validate secrets pre-flight before opening transaction
  for (const ev of events) {
    const redaction = redactSensitiveSummary(ev.summary_redacted);
    if (redaction.hadSecretAttempt) {
      const stateVer = loadControlCenterState().state_version;
      return {
        ok: false,
        httpStatus: 422,
        cached: false,
        durable_persisted: false,
        accepted_count: 0,
        duplicate_count: 0,
        accepted_event_ids: [],
        seq_gaps_detected: 0,
        seq_gaps_reconciled: 0,
        state_version: stateVer,
        error: `plaintext_secret_rejected_in_event_${ev.event_id}`,
      };
    }
  }

  return withTransaction((db) => {
    const cachedBatch = db.prepare('SELECT * FROM cc_batches WHERE batch_id = ?').get(batchId) as any;
    if (cachedBatch) {
      return {
        ok: true,
        httpStatus: 200,
        cached: true,
        durable_persisted: true,
        accepted_count: Number(cachedBatch.accepted_count),
        duplicate_count: Number(cachedBatch.duplicate_count),
        accepted_event_ids: JSON.parse(cachedBatch.accepted_event_ids_json || '[]'),
        seq_gaps_detected: 0,
        seq_gaps_reconciled: 0,
        state_version: Number(cachedBatch.state_version),
      };
    }

    let accepted = 0;
    let duplicates = 0;
    let gapsDetected = 0;
    let gapsReconciled = 0;
    const acceptedEventIds: string[] = [];
    const nowIso = new Date().toISOString();

    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    for (const ev of sorted) {
      const existingById = db.prepare('SELECT event_id FROM cc_events WHERE event_id = ?').get(ev.event_id);
      const existingBySeq = db
        .prepare('SELECT event_id FROM cc_events WHERE host_id = ? AND workspace_id = ? AND seq = ?')
        .get(ev.host_id, ev.workspace_id, ev.seq);

      if (existingById || existingBySeq) {
        duplicates += 1;
        acceptedEventIds.push(ev.event_id);
        continue;
      }

      const tracker = db
        .prepare('SELECT last_seq FROM cc_seq_tracker WHERE host_id = ? AND workspace_id = ?')
        .get(ev.host_id, ev.workspace_id) as { last_seq: number } | undefined;
      const lastSeq = tracker ? Number(tracker.last_seq) : 0;

      if (lastSeq > 0 && ev.seq > lastSeq + 1) {
        for (let missingSeq = lastSeq + 1; missingSeq < ev.seq; missingSeq += 1) {
          const insGap = db
            .prepare(
              'INSERT OR IGNORE INTO cc_seq_gaps (host_id, workspace_id, expected_seq, received_seq, reconciled, detected_at_utc) VALUES (?, ?, ?, ?, 0, ?)'
            )
            .run(ev.host_id, ev.workspace_id, missingSeq, ev.seq, nowIso);
          if (insGap.changes > 0) {
            gapsDetected += 1;
          }
        }
      } else if (ev.seq <= lastSeq) {
        // Reconcile previously detected gap if an out-of-order event arrives
        const recGap = db
          .prepare(
            'UPDATE cc_seq_gaps SET reconciled = 1, reconciled_at_utc = ? WHERE host_id = ? AND workspace_id = ? AND expected_seq = ? AND reconciled = 0'
          )
          .run(nowIso, ev.host_id, ev.workspace_id, ev.seq);
        if (recGap.changes > 0) {
          gapsReconciled += 1;
        }
      }

      if (ev.seq > lastSeq) {
        db.prepare(
          'INSERT INTO cc_seq_tracker (host_id, workspace_id, last_seq) VALUES (?, ?, ?) ON CONFLICT(host_id, workspace_id) DO UPDATE SET last_seq = excluded.last_seq'
        ).run(ev.host_id, ev.workspace_id, ev.seq);
      }

      const redaction = redactSensitiveSummary(ev.summary_redacted);
      db.prepare(
        `INSERT INTO cc_events (
          event_id, host_id, workspace_id, seq, workflow_id, task_id, correlation_id,
          event_type, occurred_at_utc, observed_at_utc, agent, status, summary_redacted,
          attempt_no, payload_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        ev.event_id,
        ev.host_id,
        ev.workspace_id,
        ev.seq,
        ev.workflow_id,
        ev.task_id,
        ev.correlation_id,
        ev.event_type,
        ev.occurred_at_utc,
        nowIso,
        ev.agent,
        ev.status,
        redaction.clean,
        ev.attempt_no,
        ev.payload_sha256 || null
      );

      acceptedEventIds.push(ev.event_id);
      accepted += 1;

      if (process.env.HELPUSDEV_CC_SIMULATE_MID_TX_CRASH === '1') {
        throw new Error('simulated_power_loss_mid_transaction');
      }

      const agentRow = db.prepare('SELECT json_data FROM cc_agents WHERE agent_id = ?').get(ev.agent) as
        | { json_data: string }
        | undefined;
      if (agentRow) {
        const agentRec = JSON.parse(agentRow.json_data) as HelpUSDevAgentStatus;
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
        db.prepare('UPDATE cc_agents SET json_data = ? WHERE agent_id = ?').run(JSON.stringify(agentRec), ev.agent);
      }
    }

    if (Array.isArray(taskSnapshots)) {
      const upsertTask = db.prepare(
        'INSERT INTO cc_tasks (task_id, json_data, updated_at_utc) VALUES (?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET json_data = excluded.json_data, updated_at_utc = excluded.updated_at_utc'
      );
      for (const snap of taskSnapshots) {
        const cleanSnap: HelpUSDevTaskProjection = {
          ...snap,
          block_reason_redacted: snap.block_reason_redacted
            ? redactSensitiveSummary(snap.block_reason_redacted).clean
            : null,
        };
        upsertTask.run(cleanSnap.task_id, JSON.stringify(cleanSnap), cleanSnap.updated_at_utc || nowIso);
      }
    }

    db.prepare("UPDATE cc_meta SET int_val = int_val + 1 WHERE key = 'state_version'").run();
    db.prepare("UPDATE cc_meta SET text_val = ? WHERE key = 'last_sync_utc'").run(nowIso);
    const newVerRow = db.prepare("SELECT int_val FROM cc_meta WHERE key = 'state_version'").get() as { int_val: number };
    const newVersion = Number(newVerRow.int_val);

    db.prepare(
      'INSERT INTO cc_batches (batch_id, processed_at_utc, accepted_count, duplicate_count, accepted_event_ids_json, state_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(batchId, nowIso, accepted, duplicates, JSON.stringify(acceptedEventIds), newVersion);

    return {
      ok: true,
      httpStatus: 200,
      cached: false,
      durable_persisted: true,
      accepted_count: accepted,
      duplicate_count: duplicates,
      accepted_event_ids: acceptedEventIds,
      seq_gaps_detected: gapsDetected,
      seq_gaps_reconciled: gapsReconciled,
      state_version: newVersion,
    };
  });
}

/**
 * Submit a SuperAdmin administrative intent (helpusdev.intent.v1) inside an atomic SQLite transaction (R18-10, R18-11).
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
  ttl_sec?: number;
}): { ok: boolean; httpStatus: number; error?: string; intent?: HelpUSDevIntentV1; current_state_version?: number } {
  let secrets: ExternalSecretsBundle;
  try {
    secrets = getRequiredSecrets();
  } catch (err: any) {
    return { ok: false, httpStatus: 503, error: err?.message || 'missing_required_hmac_secrets' };
  }

  return withTransaction((db) => {
    const verRow = db.prepare("SELECT int_val FROM cc_meta WHERE key = 'state_version'").get() as { int_val: number };
    const currentVersion = Number(verRow.int_val);

    if (params.expected_state_version !== currentVersion) {
      return {
        ok: false,
        httpStatus: 409,
        error: `state_version_conflict_expected_${params.expected_state_version}_actual_${currentVersion}`,
        current_state_version: currentVersion,
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
    const ttlMs = (params.ttl_sec ?? 300) * 1000;
    const expiresIso = new Date(Date.now() + ttlMs).toISOString();
    const intentId = `intent-r18-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const sigPayload = `${intentId}|${params.actor.id}|${params.host_id}|${params.workspace_id}|${params.target_id}|${params.verb}|${params.expected_state_version}|${params.nonce}`;
    const signature = crypto.createHmac('sha256', secrets.intentSigningSecret).update(sigPayload).digest('hex');

    const intent: HelpUSDevIntentV1 = {
      schema: 'helpusdev.intent.v1',
      intent_id: intentId,
      actor_id: params.actor.id,
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

    db.prepare('INSERT INTO cc_intents (intent_id, status, json_data, issued_at_utc) VALUES (?, ?, ?, ?)').run(
      intent.intent_id,
      intent.status,
      JSON.stringify(intent),
      intent.issued_at_utc
    );
    db.prepare("UPDATE cc_meta SET int_val = int_val + 1 WHERE key = 'state_version'").run();
    const updatedVersion = currentVersion + 1;

    return { ok: true, httpStatus: 201, intent, current_state_version: updatedVersion };
  });
}

/**
 * Acknowledge or expire an administrative intent from the Windows Host Worker inside an atomic SQLite transaction.
 */
export function ackAdminIntent(
  intentId: string,
  targetStatus: IntentStatus,
  detail: string,
  nowEpochMs: number = Date.now()
): {
  ok: boolean;
  httpStatus: number;
  error?: string;
  intent_id?: string;
  status?: IntentStatus;
  acked_at_utc?: string;
  host_ack_detail?: string;
  state_version?: number;
} {
  return withTransaction((db) => {
    const row = db.prepare('SELECT json_data FROM cc_intents WHERE intent_id = ?').get(intentId) as
      | { json_data: string }
      | undefined;
    if (!row) {
      return { ok: false, httpStatus: 404, error: 'intent_not_found' };
    }

    const found = JSON.parse(row.json_data) as HelpUSDevIntentV1;
    const expiresMs = Date.parse(found.expires_at_utc);
    const ackIso = new Date(nowEpochMs).toISOString();

    db.prepare("UPDATE cc_meta SET int_val = int_val + 1 WHERE key = 'state_version'").run();
    const newVersion = Number(
      (db.prepare("SELECT int_val FROM cc_meta WHERE key = 'state_version'").get() as { int_val: number }).int_val
    );

    if (!Number.isNaN(expiresMs) && nowEpochMs > expiresMs) {
      found.status = 'expired';
      found.host_ack_detail = 'Intent expired before host execution.';
      found.acked_at_utc = ackIso;
      db.prepare('UPDATE cc_intents SET status = ?, json_data = ? WHERE intent_id = ?').run(
        found.status,
        JSON.stringify(found),
        intentId
      );
      return {
        ok: false,
        httpStatus: 409,
        error: 'intent_expired',
        intent_id: found.intent_id,
        status: found.status,
        acked_at_utc: found.acked_at_utc,
        host_ack_detail: found.host_ack_detail,
        state_version: newVersion,
      };
    }

    found.status = targetStatus;
    found.host_ack_detail = redactSensitiveSummary(detail).clean;
    found.acked_at_utc = ackIso;
    db.prepare('UPDATE cc_intents SET status = ?, json_data = ? WHERE intent_id = ?').run(
      found.status,
      JSON.stringify(found),
      intentId
    );

    return {
      ok: true,
      httpStatus: 200,
      intent_id: found.intent_id,
      status: found.status,
      acked_at_utc: found.acked_at_utc,
      host_ack_detail: found.host_ack_detail,
      state_version: newVersion,
    };
  });
}

/**
 * Compute overview with explicit stale indicator (R18-03) and recent intents with real ACK status.
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
      seq_gaps: state.seq_gaps.filter((g) => !g.reconciled).length,
      reconciled_seq_gaps: state.seq_gaps.filter((g) => g.reconciled).length,
      pending_intents: state.intents.filter((i) => i.status === 'submitted').length,
      applied_intents: state.intents.filter((i) => i.status === 'applied').length,
    },
    agents: Object.values(state.agents),
    recent_intents: state.intents.slice(-10).reverse(),
  };
}
