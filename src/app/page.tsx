import { getEditSession } from '@/lib/session';
import { MeridianApp } from '@/components/MeridianApp';
import { listPlaces } from '@/lib/db';
import { sanitizePlaceForPublic } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await getEditSession();
  const places = await listPlaces();
  const params = await searchParams;
  const rawPlace = Array.isArray(params.place) ? params.place[0] : params.place;
  const focusPlaceId = rawPlace ? Number(rawPlace) : undefined;
  const visiblePlaces = session.loggedIn ? places : places.map(sanitizePlaceForPublic);

  return (
    <MeridianApp
      initialPlaces={visiblePlaces}
      canEdit={Boolean(session.loggedIn)}
      focusPlaceId={Number.isInteger(focusPlaceId) ? focusPlaceId : undefined}
    />
  );
}
