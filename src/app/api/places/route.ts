import { NextResponse } from 'next/server';
import { createPlace, listPlaces } from '@/lib/db';
import { requireEditSession } from '@/lib/session';
import { placeInputSchema } from '@/lib/validation';

export async function GET() {
  const places = await listPlaces();
  return NextResponse.json({ places });
}

export async function POST(request: Request) {
  const session = await requireEditSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const result = placeInputSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const place = await createPlace({
    ...result.data,
    author: result.data.author ?? null,
    visited_at: result.data.visited_at ?? null
  });

  return NextResponse.json({ place }, { status: 201 });
}
