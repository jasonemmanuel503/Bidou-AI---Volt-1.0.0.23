import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isLiveMode } from './config/mode';

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

export function getStoragePath(
  userId: string,
  jobId: string,
  variantIndex: number,
  extension: 'png' | 'jpg' | 'mp4' | 'mp3' | 'wav' | string
): string {
  return `${userId}/${jobId}/${variantIndex}.${extension}`;
}

/**
 * Stores a binary buffer or base64 data to persistent storage.
 * In live mode, uploads to Supabase Storage bucket 'generations' and throws on failure (ephemeral disks).
 * In demo mode, writes locally to /public/generations.
 */
export async function saveGenerationAsset(params: {
  userId: string;
  jobId: string;
  variantIndex: number;
  extension: 'png' | 'jpg' | 'mp4' | 'mp3' | 'wav';
  contentType: string;
  data: Buffer | Uint8Array;
}): Promise<string> {
  const { userId, jobId, variantIndex, extension, contentType, data } = params;
  const storagePath = getStoragePath(userId, jobId, variantIndex, extension);

  // 1. In live mode, must throw if Supabase storage upload fails (ephemeral disks)
  if (isLiveMode()) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('[Storage] Supabase client is not available in live mode');
    }

    const { error: uploadError } = await supabase.storage
      .from('generations')
      .upload(storagePath, data, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[Storage] Supabase storage upload failed in live mode:', uploadError.message);
      throw new Error(`[Storage] Failed to upload asset to Supabase: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from('generations').getPublicUrl(storagePath);
    if (!publicUrlData?.publicUrl) {
      throw new Error('[Storage] Failed to retrieve public URL for uploaded asset in Supabase');
    }

    return publicUrlData.publicUrl;
  }

  // 2. Demo mode: Local static storage fallback (/public/generations/{userId}/{jobId}/{variantIndex}.ext)
  const localDir = path.join(process.cwd(), 'public', 'generations', userId, jobId);
  fs.mkdirSync(localDir, { recursive: true });
  const localFilePath = path.join(localDir, `${variantIndex}.${extension}`);
  fs.writeFileSync(localFilePath, data);

  // Return web-accessible URL
  return `/generations/${userId}/${jobId}/${variantIndex}.${extension}`;
}
