import { neon } from '@neondatabase/serverless';
import { getServerEnv } from '@/lib/env';
import type { CreatePlaceInput, Place, UpdatePlaceInput } from '@/lib/types';

function getSql() {
  return neon(getServerEnv().DATABASE_URL);
}

const PLACE_COLUMNS = `
  id,
  lat,
  lng,
  title,
  content,
  images,
  thumbnails,
  author,
  visited_at,
  is_locked,
  share_token,
  created_at
`;

type PlaceRow = Omit<Place, 'visited_at' | 'created_at'> & {
  visited_at: string | Date | null;
  created_at: string | Date;
};

function toDateOnly(value: string | Date | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
}

function toDateTimeString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizePlace(row: PlaceRow): Place {
  return {
    ...row,
    visited_at: toDateOnly(row.visited_at),
    created_at: toDateTimeString(row.created_at)
  };
}

export async function listPlaces() {
  const rows = await getSql().query(`SELECT ${PLACE_COLUMNS} FROM places ORDER BY COALESCE(visited_at, created_at::date) DESC, created_at DESC`);
  return (rows as PlaceRow[]).map(normalizePlace);
}

export async function getPlaceById(id: number) {
  const rows = await getSql().query(`SELECT ${PLACE_COLUMNS} FROM places WHERE id = $1 LIMIT 1`, [id]);
  const place = (rows as PlaceRow[])[0];
  return place ? normalizePlace(place) : null;
}

export async function createPlace(input: CreatePlaceInput) {
  const rows = await getSql().query(
    `INSERT INTO places (
      lat,
      lng,
      title,
      content,
      images,
      thumbnails,
      author,
      visited_at,
      is_locked,
      share_token
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)
    RETURNING ${PLACE_COLUMNS}`,
    [
      input.lat ?? null,
      input.lng ?? null,
      input.title,
      input.content,
      input.images,
      input.thumbnails,
      input.author,
      input.visited_at,
      input.is_locked
    ]
  );

  return normalizePlace((rows as PlaceRow[])[0]);
}

export async function updatePlace(id: number, input: UpdatePlaceInput) {
  const rows = await getSql().query(
    `UPDATE places
    SET
      lat = COALESCE($1, lat),
      lng = COALESCE($2, lng),
      title = $3,
      content = $4,
      images = $5,
      thumbnails = $6,
      author = $7,
      visited_at = $8,
      is_locked = $9,
      share_token = CASE WHEN $9 THEN share_token ELSE NULL END
    WHERE id = $10
    RETURNING ${PLACE_COLUMNS}`,
    [
      input.lat,
      input.lng,
      input.title,
      input.content,
      input.images,
      input.thumbnails,
      input.author,
      input.visited_at,
      input.is_locked,
      id
    ]
  );

  const place = (rows as PlaceRow[])[0];
  return place ? normalizePlace(place) : null;
}

export async function deletePlace(id: number) {
  const rows = await getSql().query(`DELETE FROM places WHERE id = $1 RETURNING id`, [id]);
  return (rows as Array<{ id: number }>)[0] ?? null;
}

export async function listAuthors() {
  const rows = await getSql().query(
    `SELECT DISTINCT author FROM places WHERE author IS NOT NULL AND author <> '' ORDER BY author ASC`
  );

  return (rows as Array<{ author: string | null }>).map((row) => row.author).filter((author): author is string => Boolean(author));
}
