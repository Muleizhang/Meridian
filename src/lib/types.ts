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
