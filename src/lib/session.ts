import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';
import { getServerEnv } from '@/lib/env';

export type EditSession = {
  loggedIn: boolean;
};

function getEditSessionOptions(): SessionOptions {
  return {
    cookieName: 'session',
    password: getServerEnv().SESSION_SECRET,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    }
  };
}

export async function getEditSession() {
  return getIronSession<EditSession>(await cookies(), getEditSessionOptions());
}

export async function requireEditSession() {
  const session = await getEditSession();

  if (!session.loggedIn) {
    return null;
  }

  return session;
}
