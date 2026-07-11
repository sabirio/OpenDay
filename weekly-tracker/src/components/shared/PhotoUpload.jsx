import { useState, useRef, useEffect, useEffectEvent } from 'react';
import { getCurrentUserId, removePhotoPaths, uploadPhotoWithRetry, validatePhotoFile } from '../../hooks/usePhotoUpload';
import Icon from './Icon';

const MAX_PHOTOS = 15;

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
export default function PhotoUpload({ projectId, existingPaths = [], onUpload, onRemove, onError, onUploadingChange, onItemsChange }) {
  // { id, file?, path?, preview?, status: queued|uploading|uploaded|failed, error? }
  const [photos, setPhotos] = useState([]);
  const [limitNotice, setLimitNotice] = useState(null);
  const inputRef = useRef(null);

  const canAddMore = photos.length < MAX_PHOTOS;
  const previewUrlsRef = useRef(new Set());
  const anyUploading = photos.some(p => p.status === 'queued' || p.status === 'uploading');
  const notifyState = useEffectEvent(() => {
    onUploadingChange?.(anyUploading);
    onItemsChange?.(photos.map(({ id, path, status, error }) => ({ id, path, status, error })));
  });

  useEffect(() => {
    setPhotos(prev => {
      const localPaths = new Set(prev.map(item => item.path).filter(Boolean));
      const retained = prev.filter(item => !item.path || existingPaths.includes(item.path));
      return [...retained, ...existingPaths.filter(path => !localPaths.has(path)).map(path => ({ id: `saved:${path}`, path, preview: null, status: 'uploaded' }))];
    });
  }, [existingPaths]);

  useEffect(() => () => { for (const url of previewUrlsRef.current) URL.revokeObjectURL(url); }, []);

  useEffect(() => {
    notifyState();
  }, [anyUploading, photos]);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file later
    if (!files.length) return;

    const slots = MAX_PHOTOS - photos.length;
    const accepted = [];
    for (const file of files.slice(0, slots)) {
      try { accepted.push(validatePhotoFile(file)); } catch (error) { onError?.(error.message); }
    }
    const toUpload = accepted;
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
    entries.forEach(entry => previewUrlsRef.current.add(entry.preview));

    setPhotos(prev => [
      ...prev,
      ...entries.map(({ id, file, preview }) => ({ id, file, path: null, preview, status: 'queued' })),
    ]);

    const userId = await getCurrentUserId();
    if (!userId) {
      onError?.('Not signed in — cannot upload photos');
      const failedIds = new Set(entries.map(en => en.id));
      setPhotos(prev => prev.filter(p => !failedIds.has(p.id)));
      return;
    }

    // Uploads run in parallel, not one-at-a-time — previously a `for` loop
    // awaited each photo in sequence, so N photos could take up to N times
    // the per-photo timeout+retry ceiling even when only one was actually
    // stuck (every thumbnail shows its spinner immediately, so a stalled
    // first photo made every later one look hung too, even though they
    // hadn't started yet). Compress+upload+retry policy lives in
    // core/photo/uploadPhotoModel.js — each attempt gets its own storage
    // path there (a timed-out attempt's request may still land after we've
    // moved on — reusing the same path could collide with it under upsert:false).
    async function uploadEntry({ id, file }, seq) {
      try {
        const path = await uploadPhotoWithRetry(projectId, userId, file, seq);
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, path, status: 'uploaded', error: null } : p));
        return path;
      } catch (err) {
        onError?.(err?.message || 'Photo upload failed');
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, status: 'failed', error: err?.message || 'Photo upload failed' } : p));
        return null;
      }
    }

    const results = await Promise.all(entries.map((entry, i) => uploadEntry(entry, i)));
    const uploadedPaths = results.filter(Boolean);
    if (uploadedPaths.length > 0) onUpload?.(uploadedPaths);
  }

  async function retryPhoto(photo) {
    if (!photo?.file || photo.status !== 'failed') return;
    setPhotos(prev => prev.map(item => item.id === photo.id ? { ...item, status: 'uploading', error: null } : item));
    const userId = await getCurrentUserId();
    if (!userId) { setPhotos(prev => prev.map(item => item.id === photo.id ? { ...item, status: 'failed', error: 'Sign in again to retry.' } : item)); return; }
    try {
      const path = await uploadPhotoWithRetry(projectId, userId, photo.file, 0);
      setPhotos(prev => prev.map(item => item.id === photo.id ? { ...item, path, status: 'uploaded' } : item));
      onUpload?.([path]);
    } catch (error) {
      console.error('[PhotoUpload] retry failed:', error);
      setPhotos(prev => prev.map(item => item.id === photo.id ? { ...item, status: 'failed', error: 'Upload failed. Check your connection and try again.' } : item));
    }
  }

  async function removePhoto(photo) {
    if (!photo || photo.status === 'uploading' || photo.status === 'queued') return;
    setPhotos(prev => prev.filter(p => p.id !== photo.id));
    if (photo.preview) { URL.revokeObjectURL(photo.preview); previewUrlsRef.current.delete(photo.preview); }
    if (photo.path) {
      const { error } = await removePhotoPaths([photo.path]);
      if (error) {
        console.error('[PhotoUpload] storage delete failed:', error);
        onError?.('Photo removed from the list, but the file may still be in storage. It will be cleaned up separately.');
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
              {photo.preview ? <img src={photo.preview} alt={`Site photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div role="img" aria-label={`Previously uploaded site photo ${i + 1}`} style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 8, textAlign: 'center', fontSize: 12 }}>Uploaded photo {i + 1}</div>}
              {(photo.status === 'uploading' || photo.status === 'queued') ? (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="spinner" size={18} style={{ color: 'white', animation: 'field-form-spin 0.8s linear infinite' }} />
                </div>
              ) : photo.status === 'failed' ? (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(80,0,0,0.78)', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                  <span style={{ color: 'white', fontSize: 11 }}>Upload failed</span>
                  <button type="button" onClick={() => retryPhoto(photo)} style={{ minHeight: 32 }}>Retry</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => removePhoto(photo)}
                  aria-label="Remove photo"
                  style={{
                    position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)',
                    border: 'none', borderRadius: '50%', width: 44, height: 44,
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
