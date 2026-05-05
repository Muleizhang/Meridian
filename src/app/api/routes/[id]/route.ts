import { NextResponse } from 'next/server';
import { deleteRoute, getRouteById, updateRoute } from '@/lib/db';
import { requireEditSession } from '@/lib/session';
import { updateRouteInputSchema } from '@/lib/validation';

type Context = {
  params: Promise<{ id: string }>;
};

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_: Request, { params }: Context) {
  const { id: rawId } = await params;
  const id = parseId(rawId);

  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const route = await getRouteById(id);

  if (!route) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ route });
}

export async function PATCH(request: Request, { params }: Context) {
  const session = await requireEditSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = parseId(rawId);

  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json();
  const result = updateRouteInputSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const route = await updateRoute(id, {
    ...result.data,
    author: result.data.author ?? null,
    departure_at: result.data.departure_at ?? null,
    arrival_at: result.data.arrival_at ?? null
  });

  if (!route) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ route });
}

export async function DELETE(_: Request, { params }: Context) {
  const session = await requireEditSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = parseId(rawId);

  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const deleted = await deleteRoute(id);

  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
