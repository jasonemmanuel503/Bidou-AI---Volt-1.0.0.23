import { GenerationJob, GenerationJobVariant, GenerationType } from '../types';
import { newId } from './ids';

export interface LibraryItem {
  id: string; // the variant's real UUID (from generation_job_variants.id)
  job_id: string; // the parent job ID
  variant_index: number; // 0, 1, 2, ...
  output_url: string; // the variant's URL
  thumbnail_url?: string; // variant thumbnail or derived from output_url
  prompt: string; // parent job prompt
  model_name: string; // parent job model
  media_type: GenerationType; // parent job type (image / video / music)
  aspect_ratio?: string; // parent job aspect_ratio
  created_at: string; // variant created_at
  is_favorited?: boolean; // from variant or user action
  is_trashed?: boolean; // boolean
  rawJob?: GenerationJob;
  rawVariant?: GenerationJobVariant;
}

/**
 * Flattens generation jobs into independent, variant-level library items.
 * A generation job with N variants produces N items in the library view, not 1 item with N hidden children.
 */
export function flattenJobsToLibraryItems(jobs: GenerationJob[]): LibraryItem[] {
  const items: LibraryItem[] = [];

  for (const job of jobs) {
    if (!job) continue;
    const media_type: GenerationType = (job.type || (job as any).media_type || 'image') as GenerationType;
    const prompt = job.prompt || '';
    const model_name = job.model_name || '';
    const aspect_ratio = job.aspect_ratio || (media_type === 'video' ? '16:9' : media_type === 'image' ? '16:9' : '1:1');

    if (job.variants && job.variants.length > 0) {
      job.variants.forEach((v, idx) => {
        const outUrl = v.output_url || job.output_urls?.[v.variant_index ?? idx] || '';
        items.push({
          id: v.id && !v.id.includes('_var_') ? v.id : newId(),
          job_id: job.id,
          variant_index: v.variant_index ?? idx,
          output_url: outUrl,
          thumbnail_url: v.thumbnail_url || job.thumbnail_url || outUrl,
          prompt,
          model_name,
          media_type,
          aspect_ratio,
          created_at: v.created_at || job.created_at || new Date().toISOString(),
          is_favorited: Boolean((v as any).is_favorited || (job as any).is_favorited),
          is_trashed: Boolean((v as any).is_trashed || (job as any).is_trashed),
          rawJob: job,
          rawVariant: v,
        });
      });
    } else if (job.output_urls && job.output_urls.length > 0) {
      job.output_urls.forEach((url, idx) => {
        items.push({
          id: newId(),
          job_id: job.id,
          variant_index: idx,
          output_url: url,
          thumbnail_url: job.thumbnail_url || url,
          prompt,
          model_name,
          media_type,
          aspect_ratio,
          created_at: job.created_at || new Date().toISOString(),
          is_favorited: Boolean((job as any).is_favorited),
          is_trashed: Boolean((job as any).is_trashed),
          rawJob: job,
        });
      });
    } else {
      const count = job.batch_count || 1;
      for (let idx = 0; idx < count; idx++) {
        items.push({
          id: newId(),
          job_id: job.id,
          variant_index: idx,
          output_url: '',
          thumbnail_url: job.thumbnail_url,
          prompt,
          model_name,
          media_type,
          aspect_ratio,
          created_at: job.created_at || new Date().toISOString(),
          is_favorited: Boolean((job as any).is_favorited),
          is_trashed: Boolean((job as any).is_trashed),
          rawJob: job,
        });
      }
    }
  }

  return items;
}
