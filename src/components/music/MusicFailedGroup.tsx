import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { GenerationJob, GenerationJobVariant, GenerationType } from '../../types';
import { MusicBatchItem, MusicContainerTier } from '../../lib/musicMeta';
import { MusicJobGroup } from './MusicJobGroup';

export interface MusicFailedGroupProps {
  id: string;
  shortReason: string;
  mappedError: string;
  batches: MusicBatchItem[];
  tier: MusicContainerTier;
  isFavorite: (variantId: string) => boolean;
  heroVariantId: string | null;
  onToggleFavorite: (variantId: string) => void;
  onToggleHero: (variant: GenerationJobVariant, globalIndex: number) => void;
  onDownload: (url: string, filename: string, variantId: string) => void;
  onExpandVariant: (variant: GenerationJobVariant, fallbackIndex: number) => void;
  onOpenProjectPicker: (e: React.MouseEvent<HTMLElement>, job: GenerationJob, variant: GenerationJobVariant) => void;
  onOpenPlaylistPicker: (variant: GenerationJobVariant, job: GenerationJob, title: string, outputUrl: string) => void;
  onRemixPrompt?: (prompt: string, type: GenerationType) => void;
  onReusePrompt?: (job: GenerationJob) => void;
  onMoveToTrash: (job: GenerationJob, variant: GenerationJobVariant) => void;
  onDeleteFailedJobs?: (jobs: GenerationJob[]) => void;
  onOpenMobileSheet: (job: GenerationJob, variant: GenerationJobVariant, triggerEl: HTMLElement | null) => void;
}

/**
 * Section 4.4 Failure grouping:
 * Collapses earlier consecutive failed jobs sharing the same mapped error message into a
 * single expandable summary row: "{N} earlier generations failed — {reason} · credits refunded".
 */
export const MusicFailedGroup: React.FC<MusicFailedGroupProps> = ({
  shortReason,
  mappedError,
  batches,
  tier,
  isFavorite,
  heroVariantId,
  onToggleFavorite,
  onToggleHero,
  onDownload,
  onExpandVariant,
  onOpenProjectPicker,
  onOpenPlaylistPicker,
  onRemixPrompt,
  onReusePrompt,
  onMoveToTrash,
  onDeleteFailedJobs,
  onOpenMobileSheet,
}) => {
  const [expanded, setExpanded] = useState(false);
  const count = batches.length;
  const summaryLabel = `${count} earlier generation${count === 1 ? '' : 's'} failed — ${shortReason} · credits refunded`;

  return (
    <div role="listitem" className="w-full flex flex-col gap-2.5">
      <div className="w-full min-h-[44px] px-3.5 py-2 rounded-xl glass-panel border border-rose-500/25 bg-rose-500/[0.04] dark:bg-rose-500/[0.06] flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          title={mappedError}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
        >
          <AlertCircle size={15} className="text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-medium text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
            {summaryLabel}
          </span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {onDeleteFailedJobs && (
            <button
              type="button"
              onClick={() => onDeleteFailedJobs(batches.map((b) => b.job))}
              title={`Permanently delete ${count} failed generation${count === 1 ? '' : 's'}`}
              aria-label={`Permanently delete ${count} failed generation${count === 1 ? '' : 's'}`}
              className="min-h-[32px] [@media(pointer:coarse)]:min-h-[40px] px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] font-semibold transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
            >
              <Trash2 size={12} aria-hidden="true" />
              <span>{count > 1 ? 'Delete all' : 'Delete'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="min-h-[32px] px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1 text-xs font-medium text-[#6B6B75] dark:text-[#A0A0AA] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
          >
            <span className="hidden sm:inline">{expanded ? 'Hide' : 'Show'}</span>
            {expanded ? (
              <ChevronDown size={16} aria-hidden="true" />
            ) : (
              <ChevronRight size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div
          role="list"
          aria-label="Earlier failed music generations"
          className="flex flex-col gap-2.5 pl-2 sm:pl-4 border-l-2 border-rose-500/20"
        >
          {batches.map((batch) => (
            <MusicJobGroup
              key={batch.job.id}
              job={batch.job}
              variants={batch.variants}
              tier={tier}
              isFavorite={isFavorite}
              heroVariantId={heroVariantId}
              onToggleFavorite={onToggleFavorite}
              onToggleHero={onToggleHero}
              onDownload={onDownload}
              onExpandVariant={onExpandVariant}
              onOpenProjectPicker={onOpenProjectPicker}
              onOpenPlaylistPicker={onOpenPlaylistPicker}
              onRemixPrompt={onRemixPrompt}
              onReusePrompt={onReusePrompt}
              onMoveToTrash={onMoveToTrash}
              onDeleteFailedJob={onDeleteFailedJobs ? (job) => onDeleteFailedJobs([job]) : undefined}
              onOpenMobileSheet={onOpenMobileSheet}
            />
          ))}
        </div>
      )}
    </div>
  );
};
