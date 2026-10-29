import crypto from "node:crypto";
import path from "node:path";
import { access, mkdir, writeFile } from "node:fs/promises";
import { imageSize } from "image-size";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "./db.js";
import { AppError } from "./errors.js";

export const MAX_COVER_BYTES = 3 * 1024 * 1024;
const formats = {
  jpg: { mime: "image/jpeg", extension: "jpg" },
  png: { mime: "image/png", extension: "png" },
  webp: { mime: "image/webp", extension: "webp" },
} as const;
export function validateCover(bytes: Buffer) {
  if (!bytes.length)
    throw new AppError(400, "Choose an image to upload.", "EMPTY_IMAGE");
  if (bytes.length > MAX_COVER_BYTES)
    throw new AppError(
      413,
      "Choose an image smaller than 3 MB.",
      "IMAGE_TOO_LARGE",
    );
  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(bytes);
  } catch {
    throw new AppError(
      415,
      "This file is not a supported image. Choose a JPG, PNG or WebP image.",
      "INVALID_IMAGE",
    );
  }
  const format = formats[dimensions.type as keyof typeof formats];
  if (!format || !dimensions.width || !dimensions.height)
    throw new AppError(
      415,
      "Choose a JPG, PNG or WebP image. SVG and other file types cannot be used as covers.",
      "INVALID_IMAGE",
    );
  if (
    dimensions.width > 8000 ||
    dimensions.height > 8000 ||
    dimensions.width * dimensions.height > 32000000
  )
    throw new AppError(
      400,
      "This image has too many pixels. Resize it to less than 8000 pixels per side.",
      "IMAGE_DIMENSIONS_TOO_LARGE",
    );
  return { ...format, width: dimensions.width, height: dimensions.height };
}

export class CoverStorage {
  private bucketReady?: Promise<void>;
  constructor(
    private client: SupabaseClient | null,
    private directory: string,
    private bucket = process.env.EVENTZ_COVER_BUCKET || "eventz-covers",
  ) {
    this.directory = path.resolve(directory);
  }
  private async ensureBucket() {
    if (!this.client) return;
    this.bucketReady ??= (async () => {
      let result = await this.client!.storage.getBucket(this.bucket);
      if (result.error) {
        const status = String((result.error as any).statusCode || "");
        if (status !== "404" && !/bucket not found/i.test(result.error.message))
          throw new AppError(
            503,
            "Image storage is unavailable. You can still use an image link while the administrator checks storage access.",
            "COVER_STORAGE_UNAVAILABLE",
          );
        const created = await this.client!.storage.createBucket(this.bucket, {
          public: true,
          fileSizeLimit: MAX_COVER_BYTES,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        });
        // Another instance may have created the same dedicated bucket concurrently.
        if (
          created.error &&
          !["409", "400"].includes(String((created.error as any).statusCode))
        )
          throw new AppError(
            503,
            "Image storage could not be prepared. You can still use an image link.",
            "COVER_STORAGE_UNAVAILABLE",
          );
        result = await this.client!.storage.getBucket(this.bucket);
      }
      if (result.error || !result.data?.public)
        throw new AppError(
          503,
          "The event-cover storage bucket must allow public cover images. Ask the administrator to check its configuration, or use an image link.",
          "COVER_STORAGE_CONFIGURATION",
        );
    })();
    try {
      await this.bucketReady;
    } catch (error) {
      this.bucketReady = undefined;
      throw error;
    }
  }
  async upload(userId: string, bytes: Buffer) {
    const image = validateCover(bytes);
    const filename = `${crypto.randomUUID()}.${image.extension}`;
    if (this.client) {
      await this.ensureBucket();
      const objectPath = `${userId}/${filename}`;
      const { error } = await this.client.storage
        .from(this.bucket)
        .upload(objectPath, bytes, {
          contentType: image.mime,
          cacheControl: "31536000",
          upsert: false,
        });
      if (error)
        throw new AppError(
          503,
          "Your cover could not be uploaded. Try again, or use an image link.",
          "COVER_UPLOAD_FAILED",
        );
      return {
        url: this.client.storage.from(this.bucket).getPublicUrl(objectPath).data
          .publicUrl,
        width: image.width,
        height: image.height,
      };
    }
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(path.join(this.directory, filename), bytes, {
        flag: "wx",
        mode: 0o600,
      });
    } catch {
      throw new AppError(
        503,
        "Image storage is unavailable. Try again, or use an image link.",
        "COVER_STORAGE_UNAVAILABLE",
      );
    }
    return {
      url: `/api/platform/media/covers/${filename}`,
      width: image.width,
      height: image.height,
    };
  }
  async localFile(filename: string) {
    if (this.client || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename))
      throw new AppError(404, "Cover image not found.", "IMAGE_NOT_FOUND");
    const file = path.join(this.directory, filename);
    try {
      await access(file);
    } catch {
      throw new AppError(404, "Cover image not found.", "IMAGE_NOT_FOUND");
    }
    return file;
  }
}
export const coverStorage = new CoverStorage(
  db.storageClient,
  db.uploadDirectory,
);
