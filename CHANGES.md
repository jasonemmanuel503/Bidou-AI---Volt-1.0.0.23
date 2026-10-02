# Bidou AI — Architecture & Migration Audit (CHANGES.md)

This document tracks system-wide changes, architectural improvements, and security policy audits performed across Phases 0 through 7.

---

## 1. Summary of Changes by Phase

### Phase 0: Data Mode & Environment Architecture
- **Dual Mode System (`server/config/mode.ts`)**:
  - Implemented `isLiveMode()`, `isDemoMode()`, and `requireLiveMode()`.
  - Boot mode logging (`logBootMode()`) with provider readiness flags for Gemini, MusicAPI, and FuturaPay.
  - Live mode strictly requires Supabase credentials; never silently falls back to in-memory mock stores when configured in live mode.
  - Fail-fast middleware rejects `/api/*` calls with HTTP 503 if `REQUIRE_LIVE_MODE=true` but Supabase credentials are missing.

### Phase 1: Authoritative Payments & Wallet Infrastructure
- **FuturaPay Integration (`server/payments/futurapay.ts`)**:
  - Authoritative payment checkout at `POST /api/payments/checkout`.
  - HMAC-SHA256 signature verification for `POST /api/payments/webhook`.
  - Safe polling at `GET /api/payments/status/:paymentId`.
  - Atomically credit wallets and record tier purchases upon successful transaction settlement.

### Phase 2: Generation Engine & Credit Reservation
- **Server-Authoritative Pricing & Dispatch (`server/jobs.ts`, `server.ts`)**:
  - Pricing calculated exclusively on backend (`quoteGenerationCost`) matching model constraints.
  - Two-phase credit transactions: `reserveCreditsForJob` precedes external API dispatch, and `settleJobReservation` finalizes balance on completion or refunds on failure.
  - Real database records for all variants in `generation_job_variants`.

### Phase 3: Asset Storage & Media Signing
- **Storage & Tamper-Proof CDN Delivery (`server/storage.ts`, `server/mediaSigning.ts`)**:
  - Storage paths partitioned by user and job: `{userId}/{jobId}/{variantIndex}.{ext}`.
  - HMAC-SHA256 URL signing with expiration and client-scoped signatures.
  - Streaming endpoints `GET /media/asset/*` and `GET /media/download/*` with HTTP Range and content negotiation.

### Phase 4: Creative Assistants & Upscaling
- **Prompt Enhancer, Lyrics, Cover Art & Upscaling**:
  - Real model-dialect prompting via Gemini Flash (`POST /api/ai/enhance-prompt`).
  - Structured lyric composition (`POST /api/ai/generate-lyrics`).
  - Studio cover art synthesis (`POST /api/ai/generate-cover-art`).
  - Upscale tracking (`POST /api/ai/upscale`) with idempotent caching.

### Phase 5: Projects, Library & Trash Management
- **Hierarchical Asset Organization**:
  - Project management (`/api/projects`) with position reordering and multi-item grouping.
  - Soft-delete retention cycle (`/api/library/trash`) with restore and permanent purge capabilities.
  - Background retention worker cleaning expired trash items.

### Phase 6: Favorites and Playlists
- **Curated Music Management (`/api/favorites`, `/api/playlists`)**:
  - Idempotent favorite toggling with live mode database persistence.
  - Playlist creation, rename, reordering, and item assignment.
  - Case-insensitive duplicate playlist name prevention (HTTP 409 `PLAYLIST_NAME_TAKEN`).
  - Music-only constraint verification (HTTP 400 `PLAYLIST_MUSIC_ONLY`).
  - Dynamic read-time calculation of item counts and up to 4 cover art thumbnails.
  - Error key normalization in `src/lib/errorMapping.ts` (`getApiErrorMessage`) prioritizing `err.code` -> `err.detail` -> `err.message`.

### Phase 7: Hardening, Rate Limiting & Storage Policy
- **In-Memory Token Bucket Rate Limiting (`server.ts`)**:
  - `/api/ai/generate`: 10 burst capacity, 10 tokens/min refill.
  - `/api/payments/checkout`: 5 burst capacity, 5 tokens/min refill.
  - `/api/ai/enhance-prompt`: 20 burst capacity, 20 tokens/min refill.
  - Returns HTTP 429 `RATE_LIMIT_EXCEEDED` with `Retry-After` response header when throttled.
- **Storage Ephemeral Disk Guard (`server/storage.ts`)**:
  - In live mode, `saveGenerationAsset` must throw on Supabase Storage upload failure (preventing data loss from Cloud Run ephemeral disks).
  - Local static filesystem storage is strictly reserved for demo mode.

---

## 2. Audit of Client-Writable RLS Policies

Migration `supabase/migrations/0007_rls_write_policies.sql` created several client-writable RLS policies. The audit below documents the current state, associated security risks, legacy dependencies, and planned mitigation paths.

> **Policy Directive**: These policies are **retained** in this pass to prevent breaking legacy client workflows, but should be phased out in favor of backend API routes.

| Table | Policy Name | Permitted Operation | Security Risk Level | Risk Description & Legacy Dependency |
|---|---|---|---|---|
| `generation_jobs` | `own generation jobs insertable` | `INSERT (auth.uid() = user_id)` | **HIGH** | **Risk**: Allows clients to insert job rows directly into the database, potentially bypassing server credit reservation and model router validation.<br>**Dependency**: Legacy client code direct creation paths before `/api/ai/generate` was authoritative.<br>**Recommendation**: Deprecate client INSERT; restrict generation job insertion to `service_role` via backend API. |
| `generation_jobs` | `own generation jobs updatable` | `UPDATE (auth.uid() = user_id)` | **HIGH** | **Risk**: Allows clients to manipulate job status (e.g. marking jobs 'completed' or 'failed') which could trigger triggers or skew metrics.<br>**Dependency**: Legacy status updates from frontend pollers.<br>**Recommendation**: Remove client UPDATE; only backend webhook/poller with `service_role` should update job status. |
| `user_tier_badges` | `own tier badges insertable` | `INSERT (auth.uid() = user_id)` | **MEDIUM** | **Risk**: Allows clients to grant themselves tier badges without verified purchase confirmation from FuturaPay.<br>**Dependency**: Client-side optimistic badge displays.<br>**Recommendation**: Restrict writes to DB triggers (`after insert on tier_purchases`) and service-role API endpoints. |
| `user_tier_badges` | `own tier badges updatable` | `UPDATE (auth.uid() = user_id)` | **MEDIUM** | **Risk**: Allows clients to alter badge metadata or increment `times_purchased`.<br>**Dependency**: Legacy client badge state synchronization.<br>**Recommendation**: Restrict updates to backend purchase settlement. |
| `referrals` | `referrals insertable` | `INSERT (with check true)` | **HIGH** | **Risk**: Unrestricted insert access allows malicious actors or bots to flood the referrals table with spam records, spoof referrer IDs, and manipulate affiliate attribution.<br>**Dependency**: Client signup referral capture.<br>**Recommendation**: Restrict INSERT to authenticated callers with rate limiting or route through a verified `/api/referrals/claim` endpoint. |
| `credit_wallets` | `own wallet updatable` | `UPDATE (auth.uid() = user_id)` | **CRITICAL** | **Risk**: If exploited, permits clients to directly modify their credit balance (`balance_credits`).<br>**Dependency**: None in modern architecture; backend handles credits via `reserveCreditsForJob` and FuturaPay webhook.<br>**Recommendation**: Revoke client UPDATE immediately in next migration; credit updates must strictly use `service_role`. |
| `tier_purchases` | `own purchases insertable` | `INSERT (auth.uid() = user_id)` | **HIGH** | **Risk**: Permits clients to fabricate purchase records without payment gateway verification.<br>**Dependency**: Legacy test suites.<br>**Recommendation**: Restrict INSERT to `service_role` webhook handler. |

---

## 3. Migration Roadmap for Deprecating Client Writes
1. **Telemetry & Logging**: Log all client-originated INSERT/UPDATE requests on `generation_jobs`, `credit_wallets`, and `user_tier_badges` to confirm zero active traffic from production UI.
2. **Next Migration**: Drop client-writable policies:
   ```sql
   drop policy if exists "own generation jobs insertable" on generation_jobs;
   drop policy if exists "own generation jobs updatable" on generation_jobs;
   drop policy if exists "own tier badges insertable" on user_tier_badges;
   drop policy if exists "own tier badges updatable" on user_tier_badges;
   drop policy if exists "own wallet updatable" on credit_wallets;
   drop policy if exists "own purchases insertable" on tier_purchases;
   drop policy if exists "referrals insertable" on referrals;
   ```
3. **Dedicated Endpoints**: Implement `POST /api/referrals` with validation and anti-abuse protection to replace open client inserts.

---

## 4. 2026-09-28 — Responsive Suno-Class Music Generation Canvas Redesign

- **Shared Audio Playback Singleton (`src/lib/audioPlayback.ts`, `src/components/common/CircularAudioPlayer.tsx`)**:
  - Extracted the module-level `activePlayerAudio` singleton, shared `AudioContext`, and `WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>` into `src/lib/audioPlayback.ts`.
  - Added `useTrackPlayback` (scoped per `variantId` so non-active rows do not re-render on `timeupdate`) and `useGlobalAudioPlayback` hooks.
  - Updated `CircularAudioPlayer` to consume the shared singleton so at most one audio track plays across Studio rows, mobile track sheet, sticky mini-player, Lightbox, and Music Library.
- **Pure Music Metadata & Failure Grouping Helpers (`src/lib/musicMeta.ts`)**:
  - Added `deriveTrackTitle(job)` with strict precedence: explicit title → structured lyric title line → `genre` + ~6-word prompt excerpt → `"Untitled track"`.
  - Added `deriveStyleChips`, `formatDuration`, `formatRelativeTime`, deterministic brand cover gradients (`getDeterministicCoverGradient`), and consecutive identical failure grouping (`groupMusicBatches`).
- **Responsive Music Canvas Components (`src/components/music/*`, `src/components/studio/DedicatedPreviewCanvas.tsx`)**:
  - Created `MusicJobGroup.tsx`, `MusicTrackRow.tsx`, `MusicFailedGroup.tsx`, `MusicTrackSheet.tsx`, and `MusicMiniPlayer.tsx`.
  - Driven by container width (`wide` ≥900px, `medium` 560–899px, `compact` <560px) rather than viewport breakpoints so the desktop `w-64` sidebar is accounted for.
  - Uniform row heights across `queued`, `processing`, `completed`, and `failed` states to prevent layout shift when jobs complete.
  - Replaced `MAX_CANVAS_BATCHES = 8` truncation on the Music tab with 12-group pagination (`Load older tracks (+12)`) and an `Open in Music Library →` action, and hid the duplicate bottom horizontal history strip when `activeTab === 'music'`.
- **Shared Performance & Measurement Fixes (`src/hooks/useElementWidth.ts`, `src/components/studio/DedicatedPreviewCanvas.tsx`)**:
  - Added a first-frame `requestAnimationFrame` fallback (`element.clientWidth || window.innerWidth`) to `useElementWidth` so the canvas never remains blank if `ResizeObserver` does not fire immediately.
  - Scoped the 500ms progress interval in `DedicatedPreviewCanvas` to non-music active jobs (`MusicTrackRow` runs an isolated ticker inside `ProcessingRowContent` only for processing rows).

