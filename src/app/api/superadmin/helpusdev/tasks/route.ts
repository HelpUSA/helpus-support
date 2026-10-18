import { NextRequest, NextResponse } from 'next/server';
import { loadControlCenterState, verifySuperAdminRequest } from '@/lib/helpusdevControlCenter';

export async function GET(req: NextRequest) {
  const headersObj: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  const auth = verifySuperAdminRequest(headersObj);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.httpStatus });
  }

  const state = loadControlCenterState();
  const stateFilter = req.nextUrl.searchParams.get('state');
  const cursor = Number(req.nextUrl.searchParams.get('cursor') || '0');
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || '50')));

  let tasks = Object.values(state.tasks);
  if (stateFilter) {
    tasks = tasks.filter((t) => t.state === stateFilter);
  }
  tasks.sort((a, b) => b.last_event_seq - a.last_event_seq);

  const slice = tasks.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < tasks.length ? cursor + limit : null;

  return NextResponse.json({
    ok: true,
    state_version: state.state_version,
    tasks: slice,
    next_cursor: nextCursor,
  });
}
