/**
 * server/adminAuth.ts
 *
 * Plain-language summary:
 * Server-side admin authentication middleware (`requireAdmin`) and boot-time
 * configuration table logger (`logStartupValidationTable`).
 *
 * Why this exists:
 * The browser PIN modal alone cannot protect server endpoints. `requireAdmin`
 * resolves the caller from their Supabase Bearer JWT (`resolveUserFromAuthHeader`)
 * and checks that `user.email` (lower-cased) is listed in the `ADMIN_EMAILS`
 * environment variable (comma-separated). Returns HTTP 403 otherwise.
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveUserFromAuthHeader, ResolvedUser } from './db';
import { getProviderEnv, hasSupplierCredentials } from './providers/suppliers';
import { getFxXafPerUsd } from './costLedger';
import { isLiveMode } from './config/mode';
import type { SupplierId } from '../src/types';

export interface AdminAuthenticatedRequest extends Request {
  adminUser?: ResolvedUser;
}

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const allowed = getAdminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(normalized);
}

/**
 * Express middleware that requires a valid Bearer token whose user email is in `ADMIN_EMAILS`.
 */
export async function requireAdmin(
  req: AdminAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Valid Authorization Bearer token is required',
      });
      return;
    }

    if (!isAdminEmail(user.email)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Admin privileges required (email not in ADMIN_EMAILS)',
      });
      return;
    }

    req.adminUser = user;
    next();
  } catch (err: any) {
    res.status(500).json({
      error: 'ADMIN_AUTH_ERROR',
      message: err?.message || 'Failed to verify admin credentials',
    });
  }
}

/**
 * Step 7 — Startup validation table.
 * Prints a concise summary table of `PROVIDER_ENV`, supplier key presence,
 * active dev caps, `ADMIN_EMAILS` status, and `FX_XAF_PER_USD`.
 * Never crashes the server.
 */
export function logStartupValidationTable(): void {
  const providerEnv = getProviderEnv();
  const dataMode = isLiveMode() ? 'LIVE (Supabase)' : 'DEMO (In-Memory)';
  const suppliers: SupplierId[] = ['cloudflare', 'kie', 'alibaba', 'google', 'musicapi', 'sunor'];
  const supplierKeyStatus = suppliers
    .map((s) => `${s}:${hasSupplierCredentials(s) ? '✓' : '✗'}`)
    .join('  ');

  const cfCap = process.env.CF_DEV_DAILY_IMAGE_CAP || '100 (default)';
  const googleImgCap = process.env.GOOGLE_DEV_DAILY_IMAGE_CAP || '10 (default)';
  const kieCap = process.env.KIE_DEV_TOTAL_USD_CAP || '0.40 (default)';
  const aliCap = process.env.ALIBABA_DEV_DAILY_USD_CAP || '1.00 (default)';
  const googleDevVideo = process.env.DEV_ALLOW_GOOGLE_VIDEO === 'true' ? 'enabled' : 'simulated (default)';

  const adminEmails = getAdminEmails();
  const fxRate = getFxXafPerUsd();
  const fxFromEnv = Boolean((process.env.FX_XAF_PER_USD || '').trim());

  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Bidou AI (Volt) — Phase 4 Startup Validation Summary                        │');
  console.log('├──────────────────────────┬──────────────────────────────────────────────────┤');
  console.log(`│ Data Mode                │ ${dataMode.padEnd(48)} │`);
  console.log(`│ PROVIDER_ENV             │ ${providerEnv.toUpperCase().padEnd(48)} │`);
  console.log(`│ Supplier Keys            │ ${supplierKeyStatus.padEnd(48)} │`);
  console.log(
    `│ Dev Caps                 │ ${(providerEnv === 'dev' ? `CF:${cfCap} | G-Img:${googleImgCap} | Kie:$${kieCap}` : 'N/A (prod circuit breakers active)').slice(0, 48).padEnd(48)} │`
  );
  console.log(`│ Dev Google Video         │ ${googleDevVideo.padEnd(48)} │`);
  console.log(
    `│ ADMIN_EMAILS             │ ${(adminEmails.length > 0 ? `configured (${adminEmails.length} admin(s))` : 'NOT SET (all /api/admin/* return 403)').padEnd(48)} │`
  );
  console.log(
    `│ FX_XAF_PER_USD           │ ${`${fxRate} XAF/USD (${fxFromEnv ? 'env' : 'catalog default'})`.padEnd(48)} │`
  );
  console.log('└──────────────────────────┴──────────────────────────────────────────────────┘');

  if (providerEnv === 'prod' && !fxFromEnv) {
    console.warn(
      '⚠️  [Bidou Startup WARNING] PROVIDER_ENV=prod is active but FX_XAF_PER_USD is not set in environment. Using catalog constant (571.23 XAF/USD) — please confirm this rate in production!'
    );
  }
}
