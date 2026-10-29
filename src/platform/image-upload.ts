export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
export async function prepareCoverImage(file: File): Promise<Blob> {
  if (file.size > MAX_SOURCE_IMAGE_BYTES)
    throw new Error("Choose an image smaller than 20 MB.");
  if (
    !(file.type
      ? ["image/jpeg", "image/png", "image/webp"].includes(file.type)
      : /\.(jpe?g|png|webp)$/i.test(file.name))
  )
    throw new Error("Choose a JPG, PNG or WebP image.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "This image could not be opened. Try another JPG, PNG or WebP file.",
    );
  }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Image processing is unavailable in this browser. Use an image link instead.",
      );
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!image || image.size > 3 * 1024 * 1024)
      throw new Error("This image is still too large. Choose a smaller image.");
    return image;
  } finally {
    bitmap.close();
  }
}
