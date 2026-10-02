// Bidou AI Trash & Retention View (Section D)
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Clock,
  CheckSquare,
  Square,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Image as ImageIcon,
  Video,
  Music,
  ShieldAlert,
  X,
  Maximize2,
} from 'lucide-react';
import { PlanTier } from '../../types';
import { useTrash, TrashItem } from '../../hooks/useTrash';
import { MediaLightbox, LightboxItem } from '../common/MediaLightbox';
import { CircularAudioPlayer } from '../common/CircularAudioPlayer';
import { VideoPlayer } from '../common/VideoPlayer';
import { posterFor } from '../../services/media';

export interface TrashViewProps {
  planTier?: PlanTier | string;
  onSelectMedia?: (item: any) => void;
  onViewPlans?: () => void;
  userId?: string;
}

// Formats countdown chip: "Deletes in 1h 42m" or "Deletes in 28 days"
function formatCountdown(purgeAfter?: string, nowMs: number = Date.now()): {
  text: string;
  isUrgent: boolean;
} {
  if (!purgeAfter) {
    return { text: 'Deletes soon', isUrgent: false };
  }

  const targetMs = new Date(purgeAfter).getTime();
  const diffMs = targetMs - nowMs;

  if (diffMs <= 0) {
    return { text: 'Purging now...', isUrgent: true };
  }

  const oneHourMs = 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (diffMs < oneHourMs) {
    const mins = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    return { text: `Deletes in ${mins}m`, isUrgent: true };
  }

  if (diffMs < oneDayMs) {
    const hours = Math.floor(diffMs / oneHourMs);
    const mins = Math.floor((diffMs % oneHourMs) / (60 * 1000));
    return { text: `Deletes in ${hours}h ${mins}m`, isUrgent: false };
  }

  const days = Math.ceil(diffMs / oneDayMs);
  return {
    text: days === 1 ? 'Deletes in 1 day' : `Deletes in ${days} days`,
    isUrgent: false,
  };
}

export const TrashView: React.FC<TrashViewProps> = ({
  planTier = 'free',
  onSelectMedia,
  onViewPlans,
  userId,
}) => {
  const {
    trashItems,
    trashCount,
    isLoading,
    refetch,
    restoreVariants,
    purgeVariants,
    emptyTrash,
  } = useTrash({ userId, autoFetch: true });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Modal states
  const [modalType, setModalType] = useState<'purge_selected' | 'empty_all' | null>(null);
  const [itemsToPurge, setItemsToPurge] = useState<string[]>([]);
  const [confirmInput, setConfirmInput] = useState<string>('');

  // Lightbox state
  const [lightboxItems, setLightboxItems] = useState<LightboxItem[] | null>(null);
  const [lightboxInitialIndex, setLightboxInitialIndex] = useState<number>(0);

  const isFreeTier = planTier === 'free' || !planTier;

  // Live countdown ticker: ticks every 30 seconds for real-time countdown precision
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter out any items that are no longer in trashItems
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => trashItems.some((it) => it.id === id)));
  }, [trashItems]);

  const allSelected = trashItems.length > 0 && selectedIds.length === trashItems.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(trashItems.map((i) => i.id));
    }
  };

  const toggleSelectItem = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleRestoreSelected = async () => {
    if (!selectedIds.length || actionLoading) return;
    setActionLoading(true);
    try {
      await restoreVariants(selectedIds);
      setSelectedIds([]);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreSingle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await restoreVariants([id]);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    } finally {
      setActionLoading(false);
    }
  };

  const promptPurgeSingle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setItemsToPurge([id]);
    setConfirmInput('');
    setModalType('purge_selected');
  };

  const promptPurgeSelected = () => {
    if (!selectedIds.length) return;
    setItemsToPurge(selectedIds);
    setConfirmInput('');
    setModalType('purge_selected');
  };

  const promptEmptyTrash = () => {
    if (trashItems.length === 0) return;
    setConfirmInput('');
    setModalType('empty_all');
  };

  const handleConfirmPurge = async () => {
    if (confirmInput.trim() !== 'DELETE' || actionLoading) return;
    setActionLoading(true);
    try {
      if (modalType === 'empty_all') {
        await emptyTrash();
        setSelectedIds([]);
      } else if (modalType === 'purge_selected') {
        await purgeVariants(itemsToPurge);
        setSelectedIds((prev) => prev.filter((id) => !itemsToPurge.includes(id)));
      }
      setModalType(null);
      setItemsToPurge([]);
      setConfirmInput('');
    } finally {
      setActionLoading(false);
    }
  };

  const openLightboxForTrashItem = (item: TrashItem) => {
    const items: LightboxItem[] = trashItems.map((ti) => ({
      id: ti.id,
      type: (ti.media_type || 'image') as any,
      url: ti.output_url || ti.thumbnail_url || '',
      thumbnailUrl: ti.thumbnail_url,
      prompt: ti.prompt,
      modelId: (ti as any).model_id,
      modelName: ti.model_name,
      aspectRatio: ti.aspect_ratio,
      variantId: ti.id,
      rawItem: ti,
    }));
    const foundIdx = trashItems.findIndex((ti) => ti.id === item.id);
    setLightboxItems(items);
    setLightboxInitialIndex(foundIdx >= 0 ? foundIdx : 0);
  };

  return (
    <div id="trash-view" className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-16">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="jost text-2xl font-bold tracking-tight text-[#1A1A1E] dark:text-[#F5F5F7]">
              Trash
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-black/10 dark:bg-white/10 text-[#6B6B75] dark:text-[#A0A0AA]">
              {trashCount} {trashCount === 1 ? 'item' : 'items'}
            </span>
          </div>
          <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
            Deleted items stay here before being permanently purged. Restored assets return to All Assets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 rounded-xl text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh trash"
            aria-label="Refresh trash"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Free Tier Retention Banner (Section D.4) */}
      {isFreeTier && (
        <div className="rounded-2xl p-4 sm:p-4.5 bg-gradient-to-r from-amber-500/10 via-[#FF8800]/10 to-transparent border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock size={16} />
            </div>
            <div className="text-xs leading-relaxed text-[#1A1A1E] dark:text-[#F5F5F7]">
              <span>Items in your trash are removed permanently after </span>
              <strong className="font-bold text-amber-700 dark:text-amber-300">2 hours</strong>
              <span>. Upgrade to keep deleted work for 30 days.</span>
            </div>
          </div>

          {onViewPlans && (
            <button
              type="button"
              onClick={onViewPlans}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#FF8800] hover:text-[#E06000] hover:bg-[#FF8800]/10 transition-colors shrink-0 cursor-pointer"
            >
              <span>View plans</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* Bulk Action Bar (Rendered if items exist) */}
      {trashItems.length > 0 && (
        <div className="rounded-2xl bg-white/80 dark:bg-[#18181B]/80 backdrop-blur-md p-3 px-4 border border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          {/* Select all & count */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] cursor-pointer hover:opacity-80 transition-opacity"
            >
              {allSelected ? (
                <CheckSquare size={16} className="text-[#FF8800]" />
              ) : (
                <Square size={16} className="text-[#8E8E98]" />
              )}
              <span>Select all</span>
            </button>

            {selectedIds.length > 0 && (
              <span className="text-xs font-medium text-[#6B6B75] dark:text-[#A0A0AA] border-l border-black/10 dark:border-white/10 pl-3">
                {selectedIds.length} selected
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleRestoreSelected}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-[#FF8800]/15 hover:text-[#FF8800] text-[#1A1A1E] dark:text-[#F5F5F7] transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw size={13} />
                  <span>Restore selected</span>
                </button>

                <button
                  type="button"
                  onClick={promptPurgeSelected}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  <span>Delete permanently</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={promptEmptyTrash}
              disabled={actionLoading || trashItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer disabled:opacity-50 ml-auto sm:ml-0"
            >
              <Trash2 size={13} />
              <span>Empty trash</span>
            </button>
          </div>
        </div>
      )}

      {/* Grid Content / Empty State */}
      {trashItems.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center p-6 rounded-3xl bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10">
          <div className="w-14 h-14 rounded-2xl bg-black/5 dark:bg-white/5 text-[#8E8E98] flex items-center justify-center mb-3">
            <Trash2 size={26} />
          </div>
          <h3 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7] mb-1">
            Nothing in the trash
          </h3>
          <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] max-w-sm">
            Deleted items land here before they're removed for good. You can restore them anytime before they expire.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {trashItems.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const countdown = formatCountdown(item.purge_after, nowMs);
            const mediaUrl = item.output_url || item.thumbnail_url;
            const isVideo = item.media_type === 'video';
            const isMusic = item.media_type === 'music';
            const posterSrc = item.thumbnail_url ?? (mediaUrl ? `${mediaUrl}#t=0.1` : undefined);

            return (
              <div
                key={item.id}
                onClick={() => openLightboxForTrashItem(item)}
                className={`group relative rounded-2xl bg-white/90 dark:bg-[#18181B]/90 shadow-sm border transition-all cursor-pointer flex flex-col overflow-hidden opacity-70 grayscale-[30%] hover:opacity-100 hover:grayscale-0 ${
                  isSelected
                    ? 'border-[#FF8800] ring-2 ring-[#FF8800]/40 shadow-md'
                    : 'border-black/10 dark:border-white/10 hover:border-[#FF8800]/50'
                }`}
              >
                {/* Media Preview Container */}
                <div className="relative aspect-video sm:aspect-square w-full bg-black/5 dark:bg-white/5 overflow-hidden flex items-center justify-center">
                  {isVideo ? (
                    <VideoPlayer
                      src={mediaUrl}
                      variantId={item.variantId || item.id}
                      poster={posterFor(posterSrc, mediaUrl)}
                      className="w-full h-full object-cover"
                    />
                  ) : isMusic ? (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <CircularAudioPlayer
                        src={mediaUrl || ''}
                        variantId={item.variantId || item.id}
                        title={item.prompt || 'Audio Track'}
                        size={120}
                        showControls={false}
                      />
                      <span className="text-xs font-bold truncate max-w-[140px] text-[#1A1A1E] dark:text-[#F5F5F7] mt-1">
                        {item.prompt || 'Audio Track'}
                      </span>
                    </div>
                  ) : (
                    <img
                      src={mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400'}
                      alt={item.prompt || 'Trashed visual'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  )}

                  {/* Selection Checkbox Overlay */}
                  <button
                    type="button"
                    onClick={(e) => toggleSelectItem(item.id, e)}
                    className={`absolute top-2 left-2 p-1 rounded-lg backdrop-blur-md transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#FF8800] text-white opacity-100'
                        : 'bg-black/50 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-black/70'
                    }`}
                    aria-label={isSelected ? 'Deselect item' : 'Select item'}
                  >
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>

                  {/* Hover Preview Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLightboxForTrashItem(item);
                    }}
                    className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-[#FF8800] text-white backdrop-blur-sm transition-all sm:opacity-0 sm:group-hover:opacity-100 z-10 cursor-pointer shadow-md"
                    title="Preview in lightbox"
                    aria-label="Preview in lightbox"
                  >
                    <Maximize2 size={13} />
                  </button>

                  {/* Countdown Chip (Top Right) */}
                  <div
                    className={`absolute top-2 right-2 px-2 py-0.5 rounded-lg backdrop-blur-md text-[10px] font-bold flex items-center gap-1 shadow-xs ${
                      countdown.isUrgent
                        ? 'bg-rose-500/90 text-white animate-pulse'
                        : 'bg-black/70 text-white'
                    }`}
                  >
                    <Clock size={11} />
                    <span className={countdown.isUrgent ? 'font-black' : 'font-medium'}>
                      {countdown.text}
                    </span>
                  </div>

                  {/* Media Type Icon (Bottom Left) */}
                  <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white text-[9px] uppercase font-bold flex items-center gap-1">
                    {isVideo ? <Video size={10} /> : isMusic ? <Music size={10} /> : <ImageIcon size={10} />}
                    <span>{item.media_type || 'image'}</span>
                  </div>
                </div>

                {/* Card Details & Hover Actions */}
                <div className="p-3 flex flex-col gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
                      {item.prompt || 'Untitled generation'}
                    </p>
                    <p className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA] truncate mt-0.5">
                      {item.model_name || 'AI Generator'} • {item.aspect_ratio || '1:1'}
                    </p>
                  </div>

                  {/* Per-item action buttons */}
                  <div className="flex items-center justify-between gap-1 pt-1 border-t border-black/5 dark:border-white/5">
                    <button
                      type="button"
                      onClick={(e) => handleRestoreSingle(item.id, e)}
                      disabled={actionLoading}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#FF8800] hover:bg-[#FF8800]/10 transition-colors cursor-pointer"
                    >
                      <RotateCcw size={12} />
                      <span>Restore</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => promptPurgeSingle(item.id, e)}
                      disabled={actionLoading}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>Delete permanently</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Typed Confirmation Modal (Permanent Delete & Empty Trash) */}
      <AnimatePresence>
        {modalType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md"
            >
              <div className="rounded-3xl p-6 bg-white dark:bg-[#18181B] border border-rose-500/30 shadow-2xl flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-500 flex items-center justify-center">
                    <ShieldAlert size={20} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalType(null)}
                    className="p-1.5 rounded-xl text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div>
                  <h3 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    {modalType === 'empty_all'
                      ? 'Empty entire trash?'
                      : itemsToPurge.length === 1
                      ? 'Permanently delete item?'
                      : `Permanently delete ${itemsToPurge.length} items?`}
                  </h3>
                  <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1.5 leading-relaxed">
                    This action is <strong className="text-rose-600 dark:text-rose-400">completely irreversible</strong>. The underlying image, video, or audio files will be purged immediately from storage and cannot be restored.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 pt-1">
                  <label
                    htmlFor="delete-confirm-input"
                    className="text-[11px] font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]"
                  >
                    Type <span className="font-mono font-bold text-rose-500">DELETE</span> to confirm:
                  </label>
                  <input
                    id="delete-confirm-input"
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder="DELETE"
                    autoFocus
                    className="w-full px-3.5 py-2 rounded-xl text-sm font-mono border border-black/15 dark:border-white/15 bg-black/5 dark:bg-white/5 text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-hidden focus:ring-2 focus:ring-rose-500/50"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalType(null)}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmPurge}
                    disabled={confirmInput.trim() !== 'DELETE' || actionLoading}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {actionLoading && <RefreshCw size={13} className="animate-spin" />}
                    <span>Permanently Delete</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Universal Media Lightbox (Section E) */}
      <AnimatePresence>
        {lightboxItems && lightboxItems.length > 0 && (
          <MediaLightbox
            items={lightboxItems}
            initialIndex={lightboxInitialIndex}
            mode="full"
            onClose={() => setLightboxItems(null)}
            onRestore={(item) => {
              handleRestoreSingle(item.id, { stopPropagation: () => {} } as any);
              setLightboxItems((prev) => prev ? prev.filter((i) => i.id !== item.id) : null);
            }}
            onDelete={(item) => {
              promptPurgeSingle(item.id, { stopPropagation: () => {} } as any);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
