import { persistence, hasSupabaseEnv } from './persistence';

let _currentUserId: string | null = !hasSupabaseEnv() ? 'usr_amina_01' : null;

/**
 * Sets the active user ID for the client session.
 * In demo mode, this ID is forwarded as the Bearer token for simulated authentication.
 */
export function setCurrentUserId(id: string | null): void {
  _currentUserId = id;
}

/**
 * Returns the currently active user ID in client memory.
 */
export function getCurrentUserId(): string | null {
  return _currentUserId;
}

/**
 * Resolves the authentication token for API calls.
 * - In live mode (Supabase), returns the active session JWT (or null if signed out).
 * - In demo mode (no Supabase env), returns the current demo user ID.
 */
export async function getAuthToken(): Promise<string | null> {
  const token = await persistence.getAccessToken();
  if (token) {
    return token;
  }
  if (!hasSupabaseEnv()) {
    return _currentUserId || 'usr_amina_01';
  }
  return null;
}

/**
 * Returns request headers including Content-Type and Authorization Bearer when authenticated.
 */
export async function getAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
