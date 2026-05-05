import type { Place, Route } from '@/lib/types';

export function sanitizePlaceForPublic(place: Place) {
  if (!place.is_locked) {
    return place;
  }

  return {
    id: place.id,
    lat: place.lat,
    lng: place.lng,
    is_locked: true,
    created_at: place.created_at,
    title: '',
    content: '',
    images: [],
    thumbnails: [],
    author: null,
    visited_at: null,
    share_token: null
  } satisfies Place;
}

export function sanitizeRouteForPublic(route: Route) {
  if (!route.is_locked) {
    return route;
  }

  return {
    id: route.id,
    title: '',
    content: '',
    images: [],
    thumbnails: [],
    author: null,
    start_lat: route.start_lat,
    start_lng: route.start_lng,
    end_lat: route.end_lat,
    end_lng: route.end_lng,
    departure_at: null,
    arrival_at: null,
    transport_type: route.transport_type,
    is_locked: true,
    share_token: null,
    created_at: route.created_at
  } satisfies Route;
}
