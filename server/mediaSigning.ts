import crypto from 'crypto';

const secret = () =>
  process.env.MEDIA_SIGNING_SECRET ||
  crypto
    .createHash('sha256')
    .update('media:' + (process.env.SUPABASE_SERVICE_ROLE_KEY || 'bidou-demo'))
    .digest('hex');

export interface SignMediaOptions {
  scale?: string | null;
  ttlSec?: number;
}

export function signMediaUrl(
  variantId: string,
  userId: string,
  opts: SignMediaOptions = {}
): { url: string; expiresAt: number } {
  const ttl = opts.ttlSec ?? 3600;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const scalePart = opts.scale || '';
  const data = `${variantId}.${userId}.${exp}.${scalePart}`;
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  const encUid = encodeURIComponent(userId);
  const scaleParam = opts.scale ? `&scale=${encodeURIComponent(opts.scale)}` : '';
  const url = `/api/media/${variantId}?uid=${encUid}&exp=${exp}&sig=${sig}${scaleParam}`;
  return { url, expiresAt: exp * 1000 };
}

export function verifyMediaSignature(
  variantId: string,
  q: { uid?: string; exp?: string; sig?: string; scale?: string }
): string | null {
  if (!q.uid || !q.exp || !q.sig) return null;
  const expNum = parseInt(q.exp, 10);
  if (isNaN(expNum)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (expNum < now) return null; // expired

  const scalePart = q.scale || '';
  const data = `${variantId}.${q.uid}.${q.exp}.${scalePart}`;
  const expectedSig = crypto.createHmac('sha256', secret()).update(data).digest('base64url');

  try {
    const a = Buffer.from(q.sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }

  return q.uid;
}
