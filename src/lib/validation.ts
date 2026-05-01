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

const updatePlaceBaseSchema = placeBaseSchema.partial({ lat: true, lng: true });

export const placeInputSchema = placeBaseSchema.superRefine((value, ctx) => {
  if (value.images.length !== value.thumbnails.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'images and thumbnails must have the same length',
      path: ['thumbnails']
    });
  }
});

export const updatePlaceInputSchema = updatePlaceBaseSchema.superRefine((value, ctx) => {
  if (value.images.length !== value.thumbnails.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'images and thumbnails must have the same length',
      path: ['thumbnails']
    });
  }
});

export const authSchema = z.object({
  password: z.string().min(1)
});

export const uploadSchema = z.object({
  intent: z.enum(['original', 'thumb']),
  contentType: z.string().min(1)
});
