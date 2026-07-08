import { supabase } from '../lib/supabase';

const PHOTO_BUCKET = 'site-photos';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;

function normalizePaths(paths) {
  if (!Array.isArray(paths)) return [];
  return paths
    .filter((path) => typeof path === 'string')
    .map((path) => path.trim())
    .filter(Boolean);
}

function isHttpPath(path) {
  return /^https?:\/\//i.test(path);
}

function toSignedItem(path, signedUrl) {
  return { path, signedUrl, url: signedUrl };
}

export async function getSignedPhotoUrls(paths, ttl = DEFAULT_SIGNED_URL_TTL_SECONDS) {
  const normalized = normalizePaths(paths);
  const httpItems = normalized
    .filter(isHttpPath)
    .map((path) => toSignedItem(path, path));
  const storagePaths = normalized.filter((path) => !isHttpPath(path));

  if (storagePaths.length === 0) return httpItems;

  try {
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(storagePaths, ttl);

    if (error) {
      console.warn('Could not sign photo URLs', error);
    }

    const signedItems = (data || [])
      .map((item, index) => {
        if (item?.error) {
          console.warn('Could not sign photo URL', item.error);
          return null;
        }
        if (!item?.signedUrl) return null;
        return toSignedItem(item.path || storagePaths[index], item.signedUrl);
      })
      .filter(Boolean);

    return [...httpItems, ...signedItems];
  } catch (error) {
    console.warn('Could not sign photo URLs', error);
    return httpItems;
  }
}

export async function getSignedPhotoUrl(path, ttl = DEFAULT_SIGNED_URL_TTL_SECONDS) {
  const [item] = await getSignedPhotoUrls([path], ttl);
  return item?.signedUrl || null;
}

export async function removePhotoPaths(paths) {
  const storagePaths = normalizePaths(paths).filter((path) => !isHttpPath(path));
  if (storagePaths.length === 0) return { removed: [], error: null };

  try {
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .remove(storagePaths);

    if (error) {
      console.warn('Could not remove photo paths', error);
      return { removed: [], error };
    }

    return { removed: data || storagePaths, error: null };
  } catch (error) {
    console.warn('Could not remove photo paths', error);
    return { removed: [], error };
  }
}

// ─── Upload (pure I/O primitives — retry/timeout orchestration lives in
// core/photo/uploadPhotoModel.js) ───────────────────────────────────────────────

export async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

export async function uploadPhotoToBucket(path, fileBlob) {
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, fileBlob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}
