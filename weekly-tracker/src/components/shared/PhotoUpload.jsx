import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import Icon from './Icon';

/**
 * PhotoUpload — captures a photo from the camera or file picker, uploads it
 * to the private `site-photos` Storage bucket, and reports the storage path
 * (not a public URL — the bucket is private; a viewer needs to request a
 * signed URL for that path when it actually displays the photo).
 *
 * Props:
 *   projectId: string|number
 *   onUpload: (path: string) => void
 *   onError: (msg: string) => void
 */
export default function PhotoUpload({ projectId, onUpload, onError }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const localPreviewUrl = URL.createObjectURL(file);
    setPreview(localPreviewUrl);
    setUploading(true);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user?.id) throw new Error('Not signed in — cannot upload photo');

      const path = `${user.id}/${projectId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from('site-photos')
        .upload(path, file, { upsert: false });
      if (error) throw error;

      onUpload(path);
    } catch (err) {
      onError(err?.message || 'Photo upload failed');
      setPreview(null);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', minHeight: 44, padding: '10px 18px', borderRadius: 10,
          border: '2px dashed #d1d5db', background: '#fafafa',
          color: uploading ? '#9ca3af' : '#6b7280', fontSize: 14, fontWeight: 500,
          cursor: uploading ? 'default' : 'pointer',
        }}
      >
        {uploading ? (
          <Icon name="spinner" size={18} style={{ animation: 'field-form-spin 0.8s linear infinite' }} />
        ) : (
          <Icon name="camera" size={18} />
        )}
        {uploading ? 'Uploading…' : 'Take photo / choose file'}
      </button>

      {/* capture="environment" opens the rear camera on mobile */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      {preview && (
        <div style={{ position: 'relative' }}>
          <img
            src={preview}
            alt="Site photo preview"
            style={{ width: '100%', maxHeight: 192, objectFit: 'cover', borderRadius: 10, display: 'block' }}
          />
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label="Dismiss preview"
            style={{
              position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)',
              border: 'none', borderRadius: '50%', width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <Icon name="close" size={14} style={{ color: 'white' }} />
          </button>
        </div>
      )}
    </div>
  );
}
