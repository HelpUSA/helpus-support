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
  const cursor = Number(req.nextUrl.searchParams.get('cursor') || '0');
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || '50')));

  const ordered = [...state.events].sort((a, b) => a.seq - b.seq);
  const slice = ordered.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < ordered.length ? cursor + limit : null;

  return NextResponse.json({
    ok: true,
    state_version: state.state_version,
    events: slice,
    seq_gaps: state.seq_gaps,
    next_cursor: nextCursor,
  });
}
