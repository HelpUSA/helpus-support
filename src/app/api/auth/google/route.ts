import { NextResponse } from 'next/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '812202824664-s716306ibb7c15jh7aok2v0lfnuocpkn.apps.googleusercontent.com';

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const hostOrigin = origin || 'https://support.helpusbr.com';
  const redirectUri = `${hostOrigin}/api/auth/callback/google`;

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  return NextResponse.redirect(googleAuthUrl.toString());
}
