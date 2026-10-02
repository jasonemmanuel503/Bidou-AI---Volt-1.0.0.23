/**
 * Admin Authentication & Session Management
 * Provides PIN verification, session storage, and entry gating.
 * 
 * Master PIN: '2026' (or custom set in admin_credentials).
 * Admin session is maintained in sessionStorage or memory so it expires on tab close.
 */

import { persistence } from './persistence';

const ADMIN_SESSION_KEY = 'bidou:admin_authenticated';

export async function verifyAdminPin(pin: string): Promise<boolean> {
  const isValid = await persistence.verifyAdminPin(pin);

  if (isValid) {
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
    } catch {
      // Ignore private browsing restrictions
    }
  }

  return isValid;
}

export function isAdminAuthenticated(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function clearAdminSession(): void {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // Ignore
  }
}
