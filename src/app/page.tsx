import { redirect } from 'next/navigation';
import { getEditSession } from '@/lib/session';
import { MeridianApp } from '@/components/MeridianApp';
import { listPlaces } from '@/lib/db';
import { sanitizePlaceForPublic } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildQueryString(params: Record<string, string | string[] | undefined>) {
  const nextParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => nextParams.append(key, item));
      return;
    }

    if (typeof value === 'string') {
      nextParams.set(key, value);
    }
  });

  return nextParams.toString();
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await getEditSession();
  const params = await searchParams;
  const query = buildQueryString(params);

  if (session.loggedIn) {
    redirect(query ? `/edit?${query}` : '/edit');
  }

  const places = await listPlaces();
  const rawPlace = Array.isArray(params.place) ? params.place[0] : params.place;
  const focusPlaceId = rawPlace ? Number(rawPlace) : undefined;
  const visiblePlaces = places.map(sanitizePlaceForPublic);
  const siteDescription = process.env.MERIDIAN_SITE_DESCRIPTION ?? '一个双人使用的私密旅行记录网站';

  return (
    <MeridianApp
      initialPlaces={visiblePlaces}
      canEdit={false}
      focusPlaceId={Number.isInteger(focusPlaceId) ? focusPlaceId : undefined}
      siteDescription={siteDescription}
    />
  );
}
