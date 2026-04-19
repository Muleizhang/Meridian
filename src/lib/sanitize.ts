import type { Place } from '@/lib/types';

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
