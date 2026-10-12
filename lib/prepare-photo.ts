/** Normalize orientation/size locally; the server independently validates pixels. */
export async function preparePhoto(file: File): Promise<Blob> {
  if (file.size > 8_000_000 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP photo under 8 MB.');
  }
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (!image.width || !image.height || image.width * image.height > 25_000_000) throw new Error('Choose a photo smaller than 25 megapixels.');
    const scale = Math.min(1, 900 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The photo editor is unavailable in this browser. You can still publish without a photo.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('This photo could not be prepared. Choose another image.')), 'image/jpeg', quality));
    let blob = await encode(0.82);
    for (const quality of [0.7, 0.55]) {
      if (blob.size <= 1_000_000) break;
      blob = await encode(quality);
    }
    if (blob.size > 1_000_000) throw new Error('Choose a simpler or smaller photo. The prepared image must fit under 1 MB.');
    return blob;
  } finally { image.close(); }
}
