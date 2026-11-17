import { useEffect, useState } from "react";
import type { Capture } from "../types";
import { formatDateTime, formatTime } from "../lib/format";
import { CloseIcon, DownloadIcon, TrashIcon } from "./Icons";

interface GalleryProps {
  captures: Capture[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onDownload: (capture: Capture) => void;
  onDownloadAll: () => void;
}

export default function Gallery({ captures, onDelete, onClear, onDownload, onDownloadAll }: GalleryProps) {
  const [selected, setSelected] = useState<Capture | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!selected) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected]);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <section className="gallery" aria-label="Saved selfies">
      <div className="gallery__head">
        <div>
          <span className="eyebrow">Gallery</span>
          <h2 className="gallery__title">
            {captures.length === 0
              ? "Your captures live here"
              : `${captures.length} selfie${captures.length === 1 ? "" : "s"} stored on this device`}
          </h2>
        </div>

        {captures.length > 0 && (
          <div className="gallery__actions">
            <button className="btn btn--ghost btn--sm" onClick={onDownloadAll}>
              <DownloadIcon size={15} />
              Download all
            </button>
            {confirming ? (
              <div className="confirm">
                <span>Delete everything?</span>
                <button
                  className="btn btn--danger btn--sm"
                  onClick={() => {
                    onClear();
                    setConfirming(false);
                  }}
                >
                  Delete
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </div>
            ) : (
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(true)}>
                <TrashIcon size={15} />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {captures.length === 0 ? (
        <div className="gallery__empty">
          <div className="gallery__empty-mark">
            <span />
            <span />
            <span />
          </div>
          <p>Smile at the camera and save a moment. Every photo is kept offline in your browser.</p>
        </div>
      ) : (
        <div className="gallery__grid">
          {captures.map((capture) => (
            <figure className="shot" key={capture.id}>
              <button
                className="shot__open"
                onClick={() => setSelected(capture)}
                aria-label={`Open selfie from ${formatDateTime(capture.createdAt)} with ${capture.smile}% smile`}
              >
                <img src={capture.dataUrl} alt="" loading="lazy" draggable={false} />
                <span className="shot__shade" />
                <span className="shot__score">{capture.smile}%</span>
                <span className="shot__time">
                  {capture.source === "auto" ? "Auto · " : ""}
                  {formatTime(capture.createdAt)}
                </span>
              </button>
            </figure>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal modal--lightbox" role="dialog" aria-modal="true" aria-label="Saved selfie">
          <div className="modal__backdrop" onClick={() => setSelected(null)} />
          <div className="lightbox">
            <img src={selected.dataUrl} alt={`Selfie captured ${formatDateTime(selected.createdAt)}`} />
            <div className="lightbox__meta">
              <div>
                <span className="eyebrow">Captured</span>
                <strong>{formatDateTime(selected.createdAt)}</strong>
                <span className="lightbox__sub">
                  {selected.smile}% smile · {selected.source === "auto" ? "auto capture" : "manual capture"} ·{" "}
                  {selected.width}x{selected.height}
                </span>
              </div>
              <div className="lightbox__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => onDownload(selected)}>
                  <DownloadIcon size={15} />
                  Download
                </button>
                <button
                  className="btn btn--danger btn--sm"
                  onClick={() => {
                    onDelete(selected.id);
                    setSelected(null);
                  }}
                >
                  <TrashIcon size={15} />
                  Delete
                </button>
                <button
                  className="btn btn--icon"
                  onClick={() => setSelected(null)}
                  aria-label="Close photo"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
