import { z } from 'zod';

const nullableTrimmedString = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : null));

const placeBaseSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  title: z.string().trim().min(1),
  content: z.string().default(''),
  images: z.array(z.string().url()).default([]),
  thumbnails: z.array(z.string().url()).default([]),
  author: nullableTrimmedString.nullable().optional(),
  visited_at: z.string().date().nullable().optional(),
  is_locked: z.boolean().default(false)
});

const routeBaseSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().default(''),
  images: z.array(z.string().url()).default([]),
  thumbnails: z.array(z.string().url()).default([]),
  author: nullableTrimmedString.nullable().optional(),
  start_lat: z.number().finite().min(-90).max(90),
  start_lng: z.number().finite().min(-180).max(180),
  end_lat: z.number().finite().min(-90).max(90),
  end_lng: z.number().finite().min(-180).max(180),
  departure_at: z.string().datetime({ offset: true }).nullable().optional(),
  arrival_at: z.string().datetime({ offset: true }).nullable().optional(),
  transport_type: z.string().trim().min(1).default('car'),
  is_locked: z.boolean().default(false)
});

const updatePlaceBaseSchema = placeBaseSchema.partial({ lat: true, lng: true });

function refineImagePairs(
  value: { images: string[]; thumbnails: string[] },
  ctx: z.RefinementCtx
) {
  if (value.images.length !== value.thumbnails.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'images and thumbnails must have the same length',
      path: ['thumbnails']
    });
  }
}

function refineRouteTimes(
  value: { departure_at?: string | null; arrival_at?: string | null },
  ctx: z.RefinementCtx
) {
  if (!value.departure_at || !value.arrival_at) {
    return;
  }

  if (new Date(value.arrival_at).getTime() < new Date(value.departure_at).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'arrival_at must not be earlier than departure_at',
      path: ['arrival_at']
    });
  }
}

export const placeInputSchema = placeBaseSchema.superRefine((value, ctx) => {
  refineImagePairs(value, ctx);
});

export const updatePlaceInputSchema = updatePlaceBaseSchema.superRefine((value, ctx) => {
  refineImagePairs(value, ctx);
});

export const routeInputSchema = routeBaseSchema.superRefine((value, ctx) => {
  refineImagePairs(value, ctx);
  refineRouteTimes(value, ctx);
});

export const updateRouteInputSchema = routeInputSchema;

export const authSchema = z.object({
  password: z.string().min(1)
});

export const uploadSchema = z.object({
  intent: z.enum(['original', 'thumb']),
  contentType: z.string().min(1)
});
