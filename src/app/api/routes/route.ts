import { NextResponse } from 'next/server';
import { createRoute, listRoutes } from '@/lib/db';
import { requireEditSession } from '@/lib/session';
import { routeInputSchema } from '@/lib/validation';

export async function GET() {
  const routes = await listRoutes();
  return NextResponse.json({ routes });
}

export async function POST(request: Request) {
  const session = await requireEditSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const result = routeInputSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const route = await createRoute({
    ...result.data,
    author: result.data.author ?? null,
    departure_at: result.data.departure_at ?? null,
    arrival_at: result.data.arrival_at ?? null
  });

  return NextResponse.json({ route }, { status: 201 });
}
