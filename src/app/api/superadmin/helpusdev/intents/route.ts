import { NextRequest, NextResponse } from 'next/server';
import {
  enforceCsrfAndRateLimit,
  IntentVerb,
  submitAdminIntent,
  verifySuperAdminRequest,
} from '@/lib/helpusdevControlCenter';

export async function POST(req: NextRequest) {
  const headersObj: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  const auth = verifySuperAdminRequest(headersObj);
  if (!auth.ok || !auth.actor) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.httpStatus });
  }

  const rawBearer = (headersObj['authorization'] || '').slice('Bearer '.length).trim();
  const csrfCheck = enforceCsrfAndRateLimit(auth.actor.id, rawBearer, headersObj['x-csrf-token']);
  if (!csrfCheck.ok) {
    return NextResponse.json({ ok: false, error: csrfCheck.error }, { status: csrfCheck.httpStatus });
  }

  const body = await req.json();
  const res = submitAdminIntent({
    actor: auth.actor,
    tenantId: auth.tenantId || 'helpus-support',
    host_id: String(body.host_id || 'host-win-primary'),
    workspace_id: String(body.workspace_id || 'ws-helpusdev'),
    target_id: String(body.target_id || 'coordinator'),
    verb: body.verb as IntentVerb,
    reason: String(body.reason || 'SuperAdmin action'),
    nonce: String(body.nonce || ''),
    expected_state_version: Number(body.expected_state_version),
    approval_scope: body.approval_scope,
    step_up_token: body.step_up_token,
  });

  return NextResponse.json(res, { status: res.httpStatus });
}
