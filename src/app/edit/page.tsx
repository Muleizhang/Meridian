import { redirect } from 'next/navigation';
import { MeridianApp } from '@/components/MeridianApp';
import { listPlaces, listRoutes } from '@/lib/db';
import { requireEditSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type EditPageProps = {
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

export default async function EditPage({ searchParams }: EditPageProps) {
  const params = await searchParams;
  const session = await requireEditSession();

  if (!session) {
    const query = buildQueryString(params);
    const nextTarget = query ? `/edit?${query}` : '/edit';
    redirect(`/login?next=${encodeURIComponent(nextTarget)}`);
  }

  const [places, routes] = await Promise.all([listPlaces(), listRoutes()]);
  const rawPlace = Array.isArray(params.place) ? params.place[0] : params.place;
  const rawRoute = Array.isArray(params.route) ? params.route[0] : params.route;
  const focusPlaceId = rawPlace ? Number(rawPlace) : undefined;
  const focusRouteId = rawRoute ? Number(rawRoute) : undefined;
  const siteDescription = process.env.MERIDIAN_SITE_DESCRIPTION ?? '一个双人使用的私密旅行记录网站';

  return (
    <MeridianApp
      initialPlaces={places}
      initialRoutes={routes}
      canEdit
      focusPlaceId={Number.isInteger(focusPlaceId) ? focusPlaceId : undefined}
      focusRouteId={Number.isInteger(focusRouteId) ? focusRouteId : undefined}
      siteDescription={siteDescription}
    />
  );
}
