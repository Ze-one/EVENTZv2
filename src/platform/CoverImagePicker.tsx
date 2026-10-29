import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ImagePlus,
  Link2,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { platformRequest } from "./api.js";
import { prepareCoverImage } from "./image-upload.js";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
};
export default function CoverImagePicker({
  value,
  onChange,
  onBusyChange,
  disabled,
}: Props) {
  const [source, setSource] = useState<"upload" | "link">("upload");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [temporary, setTemporary] = useState("");
  const [filename, setFilename] = useState(""),
    [link, setLink] = useState(/^https:\/\//.test(value) ? value : ""),
    [imageError, setImageError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    request = useRef<AbortController | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(
    () => () => {
      if (temporary) URL.revokeObjectURL(temporary);
    },
    [temporary],
  );
  useEffect(() => {
    setImageError(false);
    setLink(/^https:\/\//.test(value) ? value : "");
  }, [value]);
  const upload = async (file?: File) => {
    if (!file || disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setImageError(false);
    setFilename(file.name);
    try {
      const image = await prepareCoverImage(file);
      if (controller.signal.aborted || !mounted.current) return;
      setTemporary(URL.createObjectURL(image));
      const result = await platformRequest<{ url: string }>("/uploads/cover", {
        method: "POST",
        headers: { "Content-Type": image.type },
        body: image,
        signal: controller.signal,
      });
      if (mounted.current) onChange(result.url);
    } catch (error: any) {
      if (mounted.current && error.name !== "AbortError") {
        setError(error.message || "Could not upload this image. Try again.");
        setFilename("");
      }
    } finally {
      request.current = null;
      if (mounted.current) {
        setTemporary("");
        setBusy(false);
        onBusyChange(false);
        if (input.current) input.current.value = "";
      }
    }
  };
  const preview = temporary || value;
  return (
    <div
      className="p-cover-picker"
      onPaste={(event) => {
        const file = event.clipboardData.files[0];
        if (file) {
          event.preventDefault();
          upload(file);
        }
      }}
    >
      <div className="p-cover-heading">
        <strong>Cover image</strong>
        <span>Optional</span>
      </div>
      <div className="p-cover-sources" aria-label="Cover image source">
        <button
          type="button"
          aria-pressed={source === "upload"}
          disabled={disabled || busy}
          onClick={() => setSource("upload")}
        >
          <Upload size={15} /> Upload image
        </button>
        <button
          type="button"
          aria-pressed={source === "link"}
          disabled={disabled || busy}
          onClick={() => setSource("link")}
        >
          <Link2 size={15} /> Image link
        </button>
      </div>
      <input
        ref={input}
        className="p-cover-file"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        aria-label="Choose cover image file"
        disabled={disabled || busy}
        onChange={(event) => upload(event.target.files?.[0])}
      />
      {source === "upload" ? (
        <div
          className={`p-cover-dropzone ${dragging ? "is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled && !busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            upload(event.dataTransfer.files[0]);
          }}
        >
          {busy ? (
            <LoaderCircle className="p-cover-spinner" size={26} />
          ) : (
            <ImagePlus size={29} strokeWidth={1.3} />
          )}
          <strong>
            {busy
              ? "Preparing and uploading your cover…"
              : "Give your event a great first impression"}
          </strong>
          <p>
            Drag an image here, paste one, or choose from your device or
            connected drives.
          </p>
          <button
            className="p-button p-button-outline"
            type="button"
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={15} /> {value ? "Replace image" : "Choose image"}
          </button>
          <small>JPG, PNG or WebP · up to 20 MB · automatically resized</small>
        </div>
      ) : (
        <label className="p-cover-link-label">
          Cover image URL
          <input
            type="url"
            maxLength={2000}
            disabled={disabled || busy}
            value={link}
            onChange={(event) => {
              setLink(event.target.value);
              onChange(event.target.value);
              setFilename("");
              setError("");
            }}
            placeholder="https://example.com/your-event-cover.jpg"
          />
          <small>Use a direct, publicly accessible HTTPS image link.</small>
        </label>
      )}
      {preview && (
        <div className="p-cover-preview">
          <img
            src={preview}
            alt="Selected event cover preview"
            onLoad={() => setImageError(false)}
            onError={() => setImageError(true)}
          />
          <div>
            <span>
              <CheckCircle2 size={15} />
              {busy ? "Uploading…" : filename || "Cover selected"}
            </span>
            <button
              type="button"
              disabled={disabled || busy}
              aria-label="Remove cover image"
              onClick={() => {
                onChange("");
                setLink("");
                setFilename("");
                setImageError(false);
                setError("");
              }}
            >
              <Trash2 size={15} /> Remove
            </button>
          </div>
        </div>
      )}
      {imageError && !busy && (
        <p className="p-cover-warning" role="status">
          This link is not displaying an image. Use a direct image URL or upload
          the file instead.
        </p>
      )}
      {error && (
        <p className="p-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="p-form-note" role="status">
          Please wait for the image upload to finish before saving your event.
        </p>
      )}
    </div>
  );
}
