import { useEffect, useMemo, useState } from 'react';
import { getSignedPhotoUrls } from '../../hooks/usePhotoUpload';

export default function PhotoGallery({ paths, title = 'Site Photos' }) {
  const photoPaths = useMemo(
    () => (Array.isArray(paths) ? paths.filter((path) => typeof path === 'string' && path.trim()) : []),
    [paths],
  );
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function signPhotos() {
      if (photoPaths.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const signedItems = await getSignedPhotoUrls(photoPaths);
      if (!cancelled) {
        setItems(signedItems);
        setLoading(false);
      }
    }

    signPhotos();

    return () => {
      cancelled = true;
    };
  }, [photoPaths]);

  if (photoPaths.length === 0) return null;

  return (
    <div className="dashboard-summary-card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{title}</div>
        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading photos...</div>}
      </div>

      {items.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 10 }}>
          {items.map((photo, index) => (
            <a
              key={`${photo.path}-${index}`}
              href={photo.signedUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${title.toLowerCase()} ${index + 1}`}
              style={{ display: 'block', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            >
              <img
                src={photo.signedUrl}
                alt={`${title} ${index + 1}`}
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </a>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Photos are attached, but signed links are not available right now.
        </div>
      )}
    </div>
  );
}
