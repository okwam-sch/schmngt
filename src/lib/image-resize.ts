/**
 * Shrinks an uploaded image to fit a square box and returns a compact data
 * URL, so logos and profile pictures stay small and print offline.
 */
export async function imageFileToDataUrl(file: File, maxSize: number): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG, WebP or SVG).");
  if (file.size > 8 * 1024 * 1024) throw new Error("The image must be smaller than 8 MB.");
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the image."));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not open the image."));
    i.src = src;
  });
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || maxSize, img.naturalHeight || maxSize));
  const w = Math.max(1, Math.round((img.naturalWidth || maxSize) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || maxSize) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/webp", 0.9);
}

/** Largest stored image (characters) — mirrored by the server schemas. */
export const MAX_IMAGE_DATA_URL = 600_000;
