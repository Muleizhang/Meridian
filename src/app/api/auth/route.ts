import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';
import { getEditSession } from '@/lib/session';
import { authSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json();
  const result = authSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (result.data.password !== getServerEnv().AUTH_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const session = await getEditSession();
  session.loggedIn = true;
  await session.save();

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getEditSession();
  session.destroy();

  return NextResponse.json({ ok: true });
}
