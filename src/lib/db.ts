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

export async function listPlaces() {
  const rows = await getSql().query(`SELECT ${PLACE_COLUMNS} FROM places ORDER BY COALESCE(visited_at, created_at::date) DESC, created_at DESC`);
  return rows as Place[];
}

export async function getPlaceById(id: number) {
  const rows = await getSql().query(`SELECT ${PLACE_COLUMNS} FROM places WHERE id = $1 LIMIT 1`, [id]);
  return (rows as Place[])[0] ?? null;
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
      input.lat,
      input.lng,
      input.title,
      input.content,
      input.images,
      input.thumbnails,
      input.author,
      input.visited_at,
      input.is_locked
    ]
  );

  return (rows as Place[])[0];
}

export async function updatePlace(id: number, input: UpdatePlaceInput) {
  const rows = await getSql().query(
    `UPDATE places
    SET
      title = $1,
      content = $2,
      images = $3,
      thumbnails = $4,
      author = $5,
      visited_at = $6,
      is_locked = $7,
      share_token = CASE WHEN $7 THEN share_token ELSE NULL END
    WHERE id = $8
    RETURNING ${PLACE_COLUMNS}`,
    [
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

  return (rows as Place[])[0] ?? null;
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
