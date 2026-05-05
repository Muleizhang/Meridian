export type Place = {
  id: number;
  lat: number;
  lng: number;
  title: string;
  content: string;
  images: string[];
  thumbnails: string[];
  author: string | null;
  visited_at: string | null;
  is_locked: boolean;
  share_token: string | null;
  created_at: string;
};

export type PlaceSummary = Pick<
  Place,
  'id' | 'lat' | 'lng' | 'title' | 'thumbnails' | 'visited_at' | 'is_locked' | 'created_at'
>;

export type CreatePlaceInput = {
  lat: number;
  lng: number;
  title: string;
  content: string;
  images: string[];
  thumbnails: string[];
  author: string | null;
  visited_at: string | null;
  is_locked: boolean;
};

export type UpdatePlaceInput = Omit<CreatePlaceInput, 'lat' | 'lng'> & Partial<Pick<CreatePlaceInput, 'lat' | 'lng'>>;

export type Route = {
  id: number;
  title: string;
  content: string;
  images: string[];
  thumbnails: string[];
  author: string | null;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  departure_at: string | null;
  arrival_at: string | null;
  transport_type: string;
  is_locked: boolean;
  share_token: string | null;
  created_at: string;
};

export type CreateRouteInput = {
  title: string;
  content: string;
  images: string[];
  thumbnails: string[];
  author: string | null;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  departure_at: string | null;
  arrival_at: string | null;
  transport_type: string;
  is_locked: boolean;
};

export type UpdateRouteInput = CreateRouteInput;

export type UploadIntent = 'original' | 'thumb';

export function isSanitizedLockedPlace(place: Place) {
  return (
    place.is_locked &&
    place.title === '' &&
    place.content === '' &&
    place.images.length === 0 &&
    place.thumbnails.length === 0 &&
    place.author === null &&
    place.visited_at === null
  );
}

export function isSanitizedLockedRoute(route: Route) {
  return (
    route.is_locked &&
    route.title === '' &&
    route.content === '' &&
    route.images.length === 0 &&
    route.thumbnails.length === 0 &&
    route.author === null &&
    route.departure_at === null &&
    route.arrival_at === null
  );
}
