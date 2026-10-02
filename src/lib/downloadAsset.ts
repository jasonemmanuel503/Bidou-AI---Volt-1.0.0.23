import { toast } from '../services/toast';

export interface DownloadAssetOptions {
  showToast?: boolean;
  throwOnError?: boolean;
}

/**
 * Downloads a media asset via same-origin Blob URL to bypass cross-origin restrictions.
 * Falls back to window.open in a new tab if blob fetch/CORS fails (unless throwOnError is true).
 */
export async function downloadAsset(
  url: string,
  filename: string,
  options: DownloadAssetOptions = {}
): Promise<void> {
  if (!url) return;
  const { showToast = false, throwOnError = false } = options;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    if (showToast) {
      toast.success('Asset downloaded');
    }
  } catch (err) {
    if (throwOnError) {
      throw err;
    }
    console.warn('[downloadAsset] Direct blob download failed, falling back to window.open:', err);
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * Derives a clean filename for a generated asset:
 * e.g. bidou-image-abcd1234.png, bidou-video-12345678.mp4, bidou-music-56789012.mp3
 * If scale is provided: bidou-image-abcd1234-2k.png
 */
export function getAssetFilename(type: string | undefined, id: string, scale?: string): string {
  const normalizedType = type?.toLowerCase() || 'asset';
  const ext = normalizedType === 'video' ? 'mp4' : normalizedType === 'music' ? 'mp3' : 'png';
  const cleanId = (id || 'asset').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8);
  const scalePart = scale ? `-${scale}` : '';
  return `bidou-${normalizedType}-${cleanId || 'asset'}${scalePart}.${ext}`;
}
