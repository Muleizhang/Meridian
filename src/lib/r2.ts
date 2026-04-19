import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerEnv } from '@/lib/env';
import type { UploadIntent } from '@/lib/types';

function getClient() {
  const env = getServerEnv();

  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY
    }
  });
}

function makeObjectKey(intent: UploadIntent) {
  const prefix = intent === 'original' ? 'original' : 'thumb';
  const rand = Math.random().toString(36).slice(2, 10);

  return `${prefix}/${Date.now()}-${rand}.jpg`;
}

export async function createUploadTarget(intent: UploadIntent, contentType: string) {
  const env = getServerEnv();
  const key = makeObjectKey(intent);
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType
  });

  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 60 * 5 });
  const fileUrl = new URL(key, env.R2_PUBLIC_URL.endsWith('/') ? env.R2_PUBLIC_URL : `${env.R2_PUBLIC_URL}/`).toString();

  return { key, uploadUrl, fileUrl };
}
