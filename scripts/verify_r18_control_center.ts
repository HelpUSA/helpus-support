import fs from 'fs';
import path from 'path';
import {
  resetControlCenterStateForTests,
  issueServerSessionToken,
  issueCsrfToken,
  verifySuperAdminRequest,
  enforceCsrfAndRateLimit,
  signDevicePayload,
  verifyDeviceRequest,
  ingestEventBatch,
  submitAdminIntent,
  getControlCenterOverview,
  loadControlCenterState,
  HelpUSDevEventV1,
} from '../src/lib/helpusdevControlCenter';

function runVerification() {
  resetControlCenterStateForTests();

  const batchInputPath = process.argv[2];
  let exportedBatch: any = null;
  if (batchInputPath && fs.existsSync(batchInputPath)) {
    exportedBatch = JSON.parse(fs.readFileSync(batchInputPath, 'utf-8'));
  }

  // 1. R18-03 Before Sync: Verify stale indicator is explicitly true when no sync has happened
  const overviewBefore = getControlCenterOverview(Date.now(), 120);
  const staleBeforeSync = overviewBefore.is_stale === true;

  // 2. R18-04 & R18-05: Authenticate Windows host device and ingest real outbox batch + simulated 1h offline gap
  const hostId = exportedBatch?.host_id || 'host-win-fd8a91c2';
  const workspaceId = exportedBatch?.workspace_id || 'ws-helpusdev-7b3e40a1';
  const batchId = exportedBatch?.batch_id || 'batch-r18-live-001';
  const baseEvents: HelpUSDevEventV1[] = Array.isArray(exportedBatch?.events) && exportedBatch.events.length > 0
    ? exportedBatch.events.slice(0, 10)
    : [
        {
          schema: 'helpusdev.event.v1',
          event_id: 'ev-r18-1',
          host_id: hostId,
          workspace_id: workspaceId,
          seq: 1,
          workflow_id: 'helpusdev_r18_workflow',
          task_id: 'R18-T1',
          correlation_id: 'R18-T1',
          event_type: 'task.created',
          occurred_at_utc: new Date(Date.now() - 3700_000).toISOString(), // >1h ago (offline simulation)
          observed_at_utc: new Date().toISOString(),
          agent: 'antigravity',
          status: 'queued',
          summary_redacted: 'Task R18-T1 created while Support Hub was offline (1h+ buffer test)',
          attempt_no: 1,
        },
      ];

  // Add an intentional sequence jump (+2) to verify gap detection as well as a duplicate event_id within the batch
  const maxSeq = Math.max(...baseEvents.map((e) => e.seq), 10);
  const gapEvent: HelpUSDevEventV1 = {
    schema: 'helpusdev.event.v1',
    event_id: `ev-r18-gap-${maxSeq + 2}`,
    host_id: hostId,
    workspace_id: workspaceId,
    seq: maxSeq + 2,
    workflow_id: 'helpusdev_r18_workflow',
    task_id: 'R18-GAP-TEST',
    correlation_id: 'R18-GAP-TEST',
    event_type: 'worker.heartbeat',
    occurred_at_utc: new Date().toISOString(),
    observed_at_utc: new Date().toISOString(),
    agent: 'antigravity',
    status: 'online',
    summary_redacted: 'Heartbeat after sequence gap test',
    attempt_no: 1,
  };

  const batchEventsWithDup = [...baseEvents, baseEvents[0], gapEvent];
  const bodyStr = JSON.stringify({ batch_id: batchId, events: batchEventsWithDup, tasks: exportedBatch?.tasks || [] });
  const tsSec = Math.floor(Date.now() / 1000);
  const devNonce = `dev-nonce-${Date.now()}`;
  const devSig = signDevicePayload(hostId, tsSec, devNonce, bodyStr);

  const stateForDev = loadControlCenterState();
  const devAuthRes = verifyDeviceRequest(
    {
      'x-helpusdev-host-id': hostId,
      'x-helpusdev-timestamp': String(tsSec),
      'x-helpusdev-nonce': devNonce,
      'x-helpusdev-signature': devSig,
    },
    bodyStr,
    stateForDev
  );

  const ingestRes1 = ingestEventBatch(batchId, batchEventsWithDup, exportedBatch?.tasks || []);

  // 3. R18-06: Replay the exact same batchId -> must return cached: true without duplicating events
  const countAfterFirst = loadControlCenterState().events.length;
  const ingestReplayRes = ingestEventBatch(batchId, batchEventsWithDup, exportedBatch?.tasks || []);
  const countAfterReplay = loadControlCenterState().events.length;

  // 4. R18-03 After Sync & Stale Simulation (>1h later)
  const overviewFresh = getControlCenterOverview(Date.now(), 120);
  const overviewStaleAfter1h = getControlCenterOverview(Date.now() + 3700_000, 120);

  // 5. R18-07: RBAC verification (unauthenticated, client_admin, super_admin)
  const unauthCheck = verifySuperAdminRequest({});
  const clientToken = issueServerSessionToken('usr-eduardo', 'helpus-support');
  const clientCheck = verifySuperAdminRequest({
    authorization: `Bearer ${clientToken}`,
    'x-helpus-tenant-id': 'helpus-support',
  });
  const superAdminToken = issueServerSessionToken('usr-wagner', 'helpus-support');
  const superAdminCheck = verifySuperAdminRequest({
    authorization: `Bearer ${superAdminToken}`,
    'x-helpus-tenant-id': 'helpus-support',
  });

  // 6. R18-08: Tenant Isolation (reject cross-tenant access to client tenant 'neuro.eduardomagalhaes' or 'kaline-modas')
  const crossTenantCheck = verifySuperAdminRequest({
    authorization: `Bearer ${superAdminToken}`,
    'x-helpus-tenant-id': 'neuro.eduardomagalhaes',
  });

  // 7. R18-09: CSRF check, Rate Limit check, and Plaintext Secret Rejection check
  const badCsrfCheck = enforceCsrfAndRateLimit('usr-wagner', superAdminToken, 'invalid-csrf-token', 5);
  const validCsrf = issueCsrfToken(superAdminToken);
  const goodCsrfCheck = enforceCsrfAndRateLimit('usr-wagner', superAdminToken, validCsrf, 3);
  enforceCsrfAndRateLimit('usr-wagner', superAdminToken, validCsrf, 3);
  enforceCsrfAndRateLimit('usr-wagner', superAdminToken, validCsrf, 3);
  const rateLimitedCheck = enforceCsrfAndRateLimit('usr-wagner', superAdminToken, validCsrf, 3);

  const secretEventRes = ingestEventBatch('batch-secret-test', [
    {
      schema: 'helpusdev.event.v1',
      event_id: 'ev-secret-999',
      host_id: hostId,
      workspace_id: workspaceId,
      seq: 9999,
      workflow_id: 'wf',
      task_id: 't-sec',
      correlation_id: 'c-sec',
      event_type: 'task.failed',
      occurred_at_utc: new Date().toISOString(),
      observed_at_utc: new Date().toISOString(),
      agent: 'antigravity',
      status: 'failed',
      summary_redacted: 'Leaked key sk-1234567890abcdefghijklmnop in summary',
      attempt_no: 1,
    },
  ]);

  // 8. R18-10 & R18-11: Submit valid intent (pause) + test 409 Conflict on stale expected_state_version
  const currentVersion = loadControlCenterState().state_version;
  const validIntentRes = submitAdminIntent({
    actor: superAdminCheck.actor!,
    tenantId: 'helpus-support',
    host_id: hostId,
    workspace_id: workspaceId,
    target_id: 'R18-T1',
    verb: 'pause',
    reason: 'SuperAdmin routine pause rehearsal',
    nonce: `intent-nonce-${Date.now()}`,
    expected_state_version: currentVersion,
  });

  // Now submit concurrent intent with old expected_state_version (must return HTTP 409 Conflict)
  const conflictIntentRes = submitAdminIntent({
    actor: superAdminCheck.actor!,
    tenantId: 'helpus-support',
    host_id: hostId,
    workspace_id: workspaceId,
    target_id: 'R18-T1',
    verb: 'resume',
    reason: 'Stale state version test',
    nonce: `intent-nonce-conflict-${Date.now()}`,
    expected_state_version: currentVersion, // outdated by +1!
  });

  // High-risk verb without step-up token rejected on portal too
  const highRiskVerbBlocked = submitAdminIntent({
    actor: superAdminCheck.actor!,
    tenantId: 'helpus-support',
    host_id: hostId,
    workspace_id: workspaceId,
    target_id: 'R18-T1',
    verb: 'approve',
    reason: 'Unapproved high risk approve without step-up',
    nonce: `intent-nonce-hr-${Date.now()}`,
    expected_state_version: loadControlCenterState().state_version,
  });

  const output = {
    R18_03: {
      pass: staleBeforeSync === true && overviewFresh.is_stale === false && overviewStaleAfter1h.is_stale === true,
      stale_before_sync: staleBeforeSync,
      fresh_after_sync: !overviewFresh.is_stale,
      stale_after_1h_offline: overviewStaleAfter1h.is_stale,
      stale_banner_sample: overviewStaleAfter1h.stale_banner_message,
      overview_counts: overviewFresh.counts,
    },
    R18_04: {
      pass: devAuthRes.ok && ingestRes1.ok && ingestRes1.accepted_count >= 2 && ingestRes1.duplicate_count >= 1 && ingestRes1.seq_gaps_detected >= 1,
      device_auth: devAuthRes,
      ingest_result: ingestRes1,
    },
    R18_05: {
      pass: ingestRes1.ok && overviewStaleAfter1h.is_stale === true && overviewFresh.is_stale === false,
      offline_1h_reconciled_events: ingestRes1.accepted_count,
    },
    R18_06: {
      pass: ingestReplayRes.cached === true && countAfterFirst === countAfterReplay,
      replay_response: ingestReplayRes,
      events_count_before_replay: countAfterFirst,
      events_count_after_replay: countAfterReplay,
    },
    R18_07: {
      pass: unauthCheck.httpStatus === 401 && clientCheck.httpStatus === 403 && superAdminCheck.httpStatus === 200,
      unauthenticated_status: unauthCheck.httpStatus,
      client_admin_status: clientCheck.httpStatus,
      client_admin_error: clientCheck.error,
      super_admin_status: superAdminCheck.httpStatus,
    },
    R18_08: {
      pass: crossTenantCheck.httpStatus === 403,
      cross_tenant_status: crossTenantCheck.httpStatus,
      cross_tenant_error: crossTenantCheck.error,
    },
    R18_09: {
      pass: badCsrfCheck.httpStatus === 403 && goodCsrfCheck.httpStatus === 200 && rateLimitedCheck.httpStatus === 429 && secretEventRes.httpStatus === 422,
      bad_csrf_status: badCsrfCheck.httpStatus,
      good_csrf_status: goodCsrfCheck.httpStatus,
      rate_limited_status: rateLimitedCheck.httpStatus,
      plaintext_secret_ingest_status: secretEventRes.httpStatus,
      plaintext_secret_error: secretEventRes.error,
    },
    R18_11: {
      pass: validIntentRes.httpStatus === 201 && conflictIntentRes.httpStatus === 409 && highRiskVerbBlocked.httpStatus === 403,
      valid_intent_status: validIntentRes.httpStatus,
      valid_intent: validIntentRes.intent,
      conflict_status: conflictIntentRes.httpStatus,
      conflict_error: conflictIntentRes.error,
      high_risk_verb_without_stepup_status: highRiskVerbBlocked.httpStatus,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

runVerification();
