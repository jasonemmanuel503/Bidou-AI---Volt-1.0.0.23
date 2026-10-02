import React, { useState } from 'react';
import { Sparkles, RotateCcw, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { GenerationJob, GenerationJobVariant, GenerationType } from '../../types';
import { MusicContainerTier, formatRelativeTime, formatMusicModelName } from '../../lib/musicMeta';
import { MusicTrackRow } from './MusicTrackRow';
import { buildCardPrompt } from '../../services/occasions';

export interface MusicJobGroupProps {
  job: GenerationJob;
  variants: GenerationJobVariant[];
  tier: MusicContainerTier;
  containerWidth?: number;
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
  onDeleteFailedJob?: (job: GenerationJob) => void;
  onOpenMobileSheet: (job: GenerationJob, variant: GenerationJobVariant, triggerEl: HTMLElement | null) => void;
}

export const MusicJobGroup: React.FC<MusicJobGroupProps> = ({
  job,
  variants,
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
  onDeleteFailedJob,
  onOpenMobileSheet,
}) => {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const showTakeLabels = variants.length >= 2;
  const relativeTime = formatRelativeTime(job.created_at);
  const promptText = job.prompt?.trim() || 'Instrumental composition';
  const isGroupFailed =
    job.status === 'failed' ||
    (variants.length > 0 &&
      variants.every((v) => {
        const s = v.status || job.status;
        return s === 'failed' || (!v.output_url && s !== 'completed' && s !== 'processing' && s !== 'queued');
      }));

  return (
    <motion.div
      role="listitem"
      layout={!prefersReducedMotion}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="w-full rounded-2xl glass-panel border border-[#FF8800]/20 overflow-hidden"
    >
      {/* Group Header: Prompt + Model + Relative Time + Group Actions */}
      <div className="px-3.5 py-2.5 border-b border-black/5 dark:border-white/5 bg-black/[0.015] dark:bg-white/[0.015] flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setPromptExpanded((prev) => !prev)}
            title={promptText}
            aria-expanded={promptExpanded}
            className={`w-full text-left text-xs font-medium text-[#1A1A1E] dark:text-[#F5F5F7] hover:text-[#F86A00] dark:hover:text-[#FF8800] transition-colors cursor-pointer rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800] ${
              promptExpanded
                ? 'whitespace-normal break-words'
                : tier === 'compact'
                ? 'line-clamp-2'
                : 'truncate'
            }`}
          >
            {promptText}
          </button>

          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
            <span className="font-medium text-[#1A1A1E]/80 dark:text-[#F5F5F7]/80 truncate max-w-[180px]">
              {formatMusicModelName(job.model_name, job.model_id)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{relativeTime}</span>
            {showTakeLabels && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#F86A00] font-semibold">
                  {variants.length} Takes
                </span>
              </>
            )}
          </div>
        </div>

        {/* Group-level Actions: Remix prompt, Reuse prompt & Delete (for failed jobs) */}
        <div className="flex items-center gap-1 shrink-0">
          {onRemixPrompt && (
            <button
              type="button"
              onClick={() => onRemixPrompt(job.prompt, 'music')}
              title="Remix prompt"
              aria-label="Remix prompt"
              className="min-h-[32px] [@media(pointer:coarse)]:min-h-[44px] px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] dark:hover:text-[#FF8800] hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
            >
              <Sparkles size={13} className="text-[#F86A00] shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Remix</span>
            </button>
          )}

          {job.occasion_id && onRemixPrompt && !isGroupFailed && (
            <button
              type="button"
              onClick={() => onRemixPrompt(buildCardPrompt(job.occasion_id!, (job.occasion_details as any) || {}), 'image')}
              title="Create matching card"
              aria-label="Create matching card"
              className="min-h-[32px] [@media(pointer:coarse)]:min-h-[44px] px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#F86A00] hover:bg-[#F86A00]/10 transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
            >
              <Sparkles size={13} className="text-[#F86A00] shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Create matching card</span>
            </button>
          )}

          {onReusePrompt && (
            <button
              type="button"
              onClick={() => onReusePrompt(job)}
              title="Reuse prompt & settings"
              aria-label="Reuse prompt & settings"
              className="min-h-[32px] [@media(pointer:coarse)]:min-h-[44px] px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
            >
              <RotateCcw size={13} className="shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Reuse</span>
            </button>
          )}

          {isGroupFailed && (
            <button
              type="button"
              onClick={() => {
                if (onDeleteFailedJob) {
                  onDeleteFailedJob(job);
                } else if (variants[0]) {
                  onMoveToTrash(job, variants[0]);
                }
              }}
              title="Permanently delete failed generation"
              aria-label="Permanently delete failed generation"
              className="min-h-[32px] [@media(pointer:coarse)]:min-h-[44px] px-2.5 py-1 rounded-lg text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
            >
              <Trash2 size={13} className="shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Track Rows (1 take, 2 takes, or N takes stacked with hairline dividers) */}
      <div
        role="list"
        aria-label={`Tracks for ${promptText.slice(0, 50)}`}
        className="divide-y divide-black/5 dark:divide-white/5 flex flex-col"
      >
        {variants.map((variant, vIdx) => {
          const takeIndex = (variant.variant_index ?? vIdx) + 1;
          const variantKey = variant.id || `${job.id}_${variant.variant_index ?? vIdx}`;
          const isVarFav = isFavorite(variant.id);
          const isVarHero = Boolean(
            heroVariantId === variant.id ||
              (variant as GenerationJobVariant & { is_hero?: boolean }).is_hero
          );

          return (
            <MusicTrackRow
              key={variantKey}
              job={job}
              variant={variant}
              takeIndex={takeIndex}
              showTakeLabel={showTakeLabels}
              tier={tier}
              isFavorite={isVarFav}
              isHero={isVarHero}
              onToggleFavorite={onToggleFavorite}
              onToggleHero={(v) => onToggleHero(v, vIdx)}
              onDownload={onDownload}
              onExpand={() => onExpandVariant(variant, vIdx)}
              onOpenProjectPicker={onOpenProjectPicker}
              onOpenPlaylistPicker={onOpenPlaylistPicker}
              onRemixPrompt={onRemixPrompt}
              onReusePrompt={onReusePrompt}
              onMoveToTrash={onMoveToTrash}
              onOpenMobileSheet={onOpenMobileSheet}
            />
          );
        })}
      </div>
    </motion.div>
  );
};
