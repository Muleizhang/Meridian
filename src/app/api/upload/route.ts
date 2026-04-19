import { NextResponse } from 'next/server';
import { createUploadTarget } from '@/lib/r2';
import { requireEditSession } from '@/lib/session';
import { uploadSchema } from '@/lib/validation';

export async function POST(request: Request) {
  const session = await requireEditSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const result = uploadSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const target = await createUploadTarget(result.data.intent, result.data.contentType);

  return NextResponse.json(target);
}
