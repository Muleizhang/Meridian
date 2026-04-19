import imageCompression from 'browser-image-compression';

async function compress(file: File, maxSizeMB: number, maxWidthOrHeight: number) {
  return imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight,
    fileType: 'image/jpeg',
    useWebWorker: true,
    initialQuality: 0.85
  });
}

export async function createImageVariants(file: File) {
  const original = await compress(file, 1.2, 1600);
  const thumbnail = await imageCompression(file, {
    maxSizeMB: 0.2,
    maxWidthOrHeight: 400,
    fileType: 'image/jpeg',
    useWebWorker: true,
    initialQuality: 0.7
  });

  return {
    original: new File([original], `${file.name.replace(/\.[^.]+$/, '') || 'image'}-original.jpg`, {
      type: 'image/jpeg'
    }),
    thumbnail: new File([thumbnail], `${file.name.replace(/\.[^.]+$/, '') || 'image'}-thumb.jpg`, {
      type: 'image/jpeg'
    })
  };
}
