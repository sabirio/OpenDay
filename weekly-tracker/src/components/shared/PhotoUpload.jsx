import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../utils/compressImage';
import Icon from './Icon';

const MAX_PHOTOS = 15;
const UPLOAD_TIMEOUT_MS = 20_000;
const RETRY_BACKOFF_MS = 1_500;

// Neither compressImage() nor supabase-js's storage.upload() enforce their own
// timeout — a stalled network request (bad mobile connection, or a backend
// hiccup) leaves its promise pending forever. Without this, `uploading: true`
// never flips back, Submit stays disabled with no error shown, and the only
// recovery is reloading the whole form. Race against a timeout so a hang
// becomes a normal, recoverable upload failure instead.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/**
 * PhotoUpload — capture/select up to MAX_PHOTOS images, compress them
 * client-side (canvas, no deps), and upload to the private `site-photos`
 * Storage bucket at `{projectId}/{year-month}/{userId}_{timestamp}.jpg`.
 *
 * Reports back storage PATHS, not URLs — the bucket is private, and a
 * signed URL would need to be requested (and eventually re-requested once
 * it expires) whenever a photo is actually displayed somewhere; the path
 * itself never expires and is the right thing to persist in photo_urls.
 *
 * Props:
 *   projectId: string|number
 *   onUpload:  (paths: string[]) => void  — called once per batch of files selected
 *   onRemove:  (path: string) => void     — called after a photo is deleted from storage
 *   onError:   (msg: string) => void
 *   onUploadingChange: (uploading: boolean) => void — fires whenever any photo's
 *     compress+upload is in flight. The parent's "at least one photo" validation
 *     reads the (async) onUpload'd paths, not this component's own optimistic
 *     preview state — without this, a submit click that lands between "thumbnail
 *     shown" and "upload finished" sees an empty photo list and rejects a report
 *     that visibly has a photo attached. Callers should disable Submit while true.
 */
export default function PhotoUpload({ projectId, onUpload, onRemove, onError, onUploadingChange }) {
  // { id: string, path: string|null, preview: string, uploading: boolean }
  const [photos, setPhotos] = useState([]);
  const [limitNotice, setLimitNotice] = useState(null);
  const inputRef = useRef(null);

  const canAddMore = photos.length < MAX_PHOTOS;
  const anyUploading = photos.some(p => p.uploading);

  useEffect(() => {
    onUploadingChange?.(anyUploading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyUploading]);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file later
    if (!files.length) return;

    const slots = MAX_PHOTOS - photos.length;
    const toUpload = files.slice(0, slots);
    setLimitNotice(files.length > slots ? `Max ${MAX_PHOTOS} photos — added the first ${slots}.` : null);
    if (toUpload.length === 0) return;

    // Each photo gets a stable id independent of its array position — once
    // uploads run in parallel (below), an earlier photo in the same batch
    // failing and being removed would otherwise shift every later photo's
    // index, causing a completion/removal to land on the wrong slot.
    const entries = toUpload.map((file, i) => ({
      id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
    }));

    setPhotos(prev => [
      ...prev,
      ...entries.map(({ id, preview }) => ({ id, path: null, preview, uploading: true })),
    ]);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      onError?.('Not signed in — cannot upload photos');
      const failedIds = new Set(entries.map(en => en.id));
      setPhotos(prev => prev.filter(p => !failedIds.has(p.id)));
      return;
    }
    const yearMonth = new Date().toISOString().slice(0, 7); // "2025-07"

    // One attempt = compress + upload, each attempt gets its own storage path
    // (a timed-out attempt's request may still land after we've moved on —
    // reusing the same path could collide with it under upsert:false).
    // compressImage() is wrapped too — a stalled canvas decode is just as
    // capable of hanging forever as a stalled network request.
    async function attemptUpload(file, seq) {
      const compressed = await withTimeout(
        compressImage(file),
        UPLOAD_TIMEOUT_MS,
        'Photo processing timed out — try a different photo.'
      );
      const path = `${projectId}/${yearMonth}/${user.id}_${Date.now()}_${seq}.jpg`;
      const { error } = await withTimeout(
        supabase.storage.from('site-photos').upload(path, compressed, { contentType: 'image/jpeg', upsert: false }),
        UPLOAD_TIMEOUT_MS,
        'Photo upload timed out — check your connection and try again.'
      );
      if (error) throw error;
      return path;
    }

    // Uploads run in parallel, not one-at-a-time — previously a `for` loop
    // awaited each photo in sequence, so N photos could take up to N times
    // the per-photo timeout+retry ceiling even when only one was actually
    // stuck (every thumbnail shows its spinner immediately, so a stalled
    // first photo made every later one look hung too, even though they
    // hadn't started yet).
    async function uploadEntry({ id, file }, seq) {
      try {
        let path;
        try {
          path = await attemptUpload(file, seq);
        } catch {
          // A single transient network hiccup shouldn't force the contractor
          // to re-pick the photo from scratch — one retry after a short backoff.
          await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
          path = await attemptUpload(file, seq);
        }
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, path, uploading: false } : p));
        return path;
      } catch (err) {
        onError?.(err?.message || 'Photo upload failed');
        setPhotos(prev => prev.filter(p => p.id !== id));
        return null;
      }
    }

    const results = await Promise.all(entries.map((entry, i) => uploadEntry(entry, i)));
    const uploadedPaths = results.filter(Boolean);
    if (uploadedPaths.length > 0) onUpload?.(uploadedPaths);
  }

  async function removePhoto(photo) {
    if (!photo || photo.uploading) return;
    setPhotos(prev => prev.filter(p => p.id !== photo.id));
    if (photo.path) {
      const { error } = await supabase.storage.from('site-photos').remove([photo.path]);
      if (error) {
        onError?.(`Photo removed from the list, but the file may still be in storage: ${error.message}`);
      }
      onRemove?.(photo.path);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Photos: {photos.length} / {MAX_PHOTOS}</span>
        {limitNotice && <span style={{ fontSize: 12, color: 'var(--status-alert)' }}>{limitNotice}</span>}
      </div>

      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
          {photos.map((photo, i) => (
            <div key={photo.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-elevated)' }}>
              <img src={photo.preview} alt={`Site photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {photo.uploading ? (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="spinner" size={18} style={{ color: 'white', animation: 'field-form-spin 0.8s linear infinite' }} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => removePhoto(photo)}
                  aria-label="Remove photo"
                  style={{
                    position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)',
                    border: 'none', borderRadius: '50%', width: 22, height: 22,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                  }}
                >
                  <Icon name="close" size={12} style={{ color: 'white' }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', minHeight: 44, padding: '10px 18px', borderRadius: 10,
            border: '2px dashed var(--border-strong)', background: 'var(--bg-elevated)',
            color: 'var(--text-muted)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Icon name="camera" size={18} />
          Add photo ({MAX_PHOTOS - photos.length} left)
        </button>
      )}

      {/* capture="environment" opens the rear camera on mobile */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: 'none' }}
        onChange={handleFiles}
      />
    </div>
  );
}
