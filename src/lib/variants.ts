import { GenerationJob, GenerationJobVariant } from '../types';

export function variantsForJob(job: GenerationJob): GenerationJobVariant[] {
  const real = (job.variants ?? []).filter((v) => !v.deleted_at && !v.purged_at);
  if (real.length) return real;
  const urls = job.output_urls ?? [];
  const n = urls.length || job.batch_count || 1;
  return Array.from({ length: n }, (_, i) => ({
    id: `syn_${job.id}_${i}`,
    job_id: job.id,
    user_id: job.user_id,
    variant_index: i,
    status: job.status,
    output_url: urls[i],
    credits_unit: Math.round((job.credit_cost || 0) / n),
    created_at: job.created_at,
    updated_at: job.created_at,
  }) as GenerationJobVariant);
}
