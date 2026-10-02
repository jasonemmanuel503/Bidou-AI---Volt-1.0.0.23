import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from './db';

const PURGE_INTERVAL_MS = 5 * 60 * 1000; // every 5 min — free tier is 2h, so this is ample
const PURGE_BATCH = 200;

/**
 * Retention worker: purges expired soft-deleted variants.
 * Removes files from Supabase Storage and local storage fallback,
 * nulls output URLs, and stamps purged_at on the variant rows.
 */
export function startRetentionWorker() {
  setInterval(async () => {
    const admin = getSupabaseAdmin();
    // Rule: The worker never runs when getSupabaseAdmin() returns null (never purge against mock store)
    if (!admin) return;

    try {
      const { data: expired, error: fetchError } = await admin
        .from('generation_job_variants')
        .select('id, user_id, job_id, storage_path, output_url')
        .not('deleted_at', 'is', null)
        .is('purged_at', null)
        .lt('purge_after', new Date().toISOString())
        .limit(PURGE_BATCH);

      if (fetchError) {
        console.error('[Retention] Error fetching expired variants:', fetchError.message);
        return;
      }

      if (!expired?.length) return;

      // 1. Delete the bytes from Supabase Storage. Also remove any upscale derivatives.
      const paths = expired.map((v) => v.storage_path).filter(Boolean) as string[];

      // Fetch potential upscales
      const { data: ups } = await admin
        .from('generation_upscales')
        .select('output_url')
        .in('variant_id', expired.map((v) => v.id));

      if (paths.length) {
        const { error } = await admin.storage.from('generations').remove(paths);
        // Do NOT mark purged if byte removal failed — retry next cycle.
        if (error) {
          console.error('[Retention] Supabase storage remove failed:', error.message);
          return;
        }
      }

      // 1b. Local-storage fallback cleanup: server/storage.ts writes to public/generations/...
      // Must delete local files as well to prevent disk exhaustion.
      for (const v of expired) {
        try {
          if (v.storage_path) {
            const localPath = path.join(process.cwd(), 'public', 'generations', v.storage_path);
            if (fs.existsSync(localPath)) {
              fs.rmSync(localPath, { force: true });
            }
          } else if (v.output_url && v.output_url.startsWith('/generations/')) {
            const relativePath = v.output_url.replace(/^\//, '');
            const localPath = path.join(process.cwd(), 'public', relativePath);
            if (fs.existsSync(localPath)) {
              fs.rmSync(localPath, { force: true });
            }
          }
        } catch (err: any) {
          console.warn('[Retention] Local storage file cleanup warning:', err?.message || err);
        }
      }

      // 2. Null the URLs and stamp purged_at. Row survives for the audit trail.
      const { error: updateError } = await admin
        .from('generation_job_variants')
        .update({
          purged_at: new Date().toISOString(),
          output_url: null,
          thumbnail_url: null,
          upscaled_urls: {},
        })
        .in('id', expired.map((v) => v.id));

      if (updateError) {
        console.error('[Retention] Variant purged_at update failed:', updateError.message);
        return;
      }

      console.log(`[Retention] Successfully purged ${expired.length} variants`);
    } catch (err: any) {
      console.error('[Retention] Unexpected worker exception:', err?.message || err);
    }
  }, PURGE_INTERVAL_MS);

  console.log('[Retention] Worker started (runs every 5 minutes)');
}
