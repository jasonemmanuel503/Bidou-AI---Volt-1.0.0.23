import { GenerationJob, LibraryItem } from '../types';
import { getCurrentUserId } from '../services/authToken';

/**
 * Converts a LibraryItem (flattened variant + job metadata) to a GenerationJob
 * so Studio and preview players can handle it seamlessly.
 */
export function libraryItemToJob(item: LibraryItem, fallbackUserId?: string): GenerationJob {
  if (item.rawJob) {
    return item.rawJob;
  }

  return {
    id: item.job_id || item.id,
    user_id: item.user_id || fallbackUserId || getCurrentUserId(),
    type: item.media_type,
    prompt: item.prompt,
    model_name: item.model_name,
    aspect_ratio: item.aspect_ratio,
    resolution: item.resolution,
    duration_seconds: item.duration_seconds,
    genre: item.genre,
    cover_art_url: item.cover_art_url,
    status: 'completed',
    output_urls: item.output_url ? [item.output_url] : [],
    variants: [item],
    created_at: item.created_at,
  };
}
