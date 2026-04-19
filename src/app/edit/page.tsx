import { redirect } from 'next/navigation';
import { MeridianApp } from '@/components/MeridianApp';
import { listPlaces } from '@/lib/db';
import { requireEditSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type EditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditPage({ searchParams }: EditPageProps) {
  const session = await requireEditSession();

  if (!session) {
    redirect('/login');
  }

  const places = await listPlaces();
  const params = await searchParams;
  const rawPlace = Array.isArray(params.place) ? params.place[0] : params.place;
  const focusPlaceId = rawPlace ? Number(rawPlace) : undefined;

  return (
    <MeridianApp
      initialPlaces={places}
      canEdit
      focusPlaceId={Number.isInteger(focusPlaceId) ? focusPlaceId : undefined}
    />
  );
}
