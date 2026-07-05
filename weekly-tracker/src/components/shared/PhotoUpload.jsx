import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../utils/compressImage';
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
 */
export default function PhotoUpload({ projectId, onUpload, onRemove, onError }) {
  // { path: string|null, preview: string, uploading: boolean }
  const [photos, setPhotos] = useState([]);
  const [limitNotice, setLimitNotice] = useState(null);
  const inputRef = useRef(null);

  const canAddMore = photos.length < MAX_PHOTOS;

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file later
    if (!files.length) return;

    const slots = MAX_PHOTOS - photos.length;
    const toUpload = files.slice(0, slots);
    setLimitNotice(files.length > slots ? `Max ${MAX_PHOTOS} photos — added the first ${slots}.` : null);
    if (toUpload.length === 0) return;

    const startIndex = photos.length;
    setPhotos(prev => [
      ...prev,
      ...toUpload.map(f => ({ path: null, preview: URL.createObjectURL(f), uploading: true })),
    ]);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      onError?.('Not signed in — cannot upload photos');
      setPhotos(prev => prev.filter((_, idx) => idx < startIndex));
      return;
    }
    const yearMonth = new Date().toISOString().slice(0, 7); // "2025-07"

    const uploadedPaths = [];

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      const photoIndex = startIndex + i;
      try {
        const compressed = await compressImage(file);
        const path = `${projectId}/${yearMonth}/${user.id}_${Date.now()}_${i}.jpg`;

        const { error: uploadErr } = await supabase.storage
          .from('site-photos')
          .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
        if (uploadErr) throw uploadErr;

        uploadedPaths.push(path);
        setPhotos(prev => prev.map((p, idx) => idx === photoIndex ? { ...p, path, uploading: false } : p));
      } catch (err) {
        onError?.(err?.message || 'Photo upload failed');
        setPhotos(prev => prev.filter((_, idx) => idx !== photoIndex));
      }
    }

    if (uploadedPaths.length > 0) onUpload?.(uploadedPaths);
  }

  async function removePhoto(index) {
    const photo = photos[index];
    if (!photo || photo.uploading) return;
    setPhotos(prev => prev.filter((_, i) => i !== index));
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
            <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-elevated)' }}>
              <img src={photo.preview} alt={`Site photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {photo.uploading ? (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="spinner" size={18} style={{ color: 'white', animation: 'field-form-spin 0.8s linear infinite' }} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
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
            border: '2px dashed #d1d5db', background: 'var(--bg-elevated)',
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
