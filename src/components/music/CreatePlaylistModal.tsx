import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ListMusic,
  Plus,
  X,
  Music,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Playlist } from '../../types';
import { usePlaylists } from '../../hooks/usePlaylists';
import { toast } from '../../services/toast';
import { getApiErrorMessage } from '../../lib/errorMapping';

export interface CreatePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  variantId?: string;
  trackPreview?: {
    title?: string;
    prompt?: string;
    duration?: number;
    genre?: string;
    coverUrl?: string;
  };
  onSuccess?: (playlist: Playlist) => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  isOpen,
  onClose,
  variantId,
  trackPreview,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { createPlaylist } = usePlaylists(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setTagInput('');
      setTags([]);
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddTag = (raw: string) => {
    const trimmed = raw.trim().replace(/^[#,]/, '').slice(0, 20);
    if (!trimmed) return;
    if (tags.length >= 3) {
      toast.info('Maximum 3 tags per playlist');
      return;
    }
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setTagInput('');
      return;
    }
    setTags([...tags, trimmed]);
    setTagInput('');
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const handleRemoveTag = (indexToRemove: number) => {
    setTags(tags.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Playlist name is required');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // If there's an uncommitted tag in the input, commit it if space permits
    const finalTags = [...tags];
    if (tagInput.trim() && finalTags.length < 3) {
      const extraTag = tagInput.trim().replace(/^[#,]/, '').slice(0, 20);
      if (!finalTags.some((t) => t.toLowerCase() === extraTag.toLowerCase())) {
        finalTags.push(extraTag);
      }
    }

    try {
      const created = await createPlaylist({
        name: trimmedName,
        tags: finalTags,
        variantId,
      });

      toast.success(
        variantId
          ? `Created playlist "${created.name}" and added track`
          : `Created playlist "${created.name}"`
      );

      if (onSuccess) {
        onSuccess(created);
      }
      onClose();
    } catch (err: any) {
      console.error('Error creating playlist:', err);
      if (err?.code === 'PLAYLIST_NAME_TAKEN' || err?.status === 409) {
        setErrorMessage('You already have a playlist with that name');
      } else if (err?.code === 'PLAYLIST_MUSIC_ONLY' || err?.status === 400) {
        setErrorMessage('Only music tracks can be added to playlists');
      } else {
        setErrorMessage(getApiErrorMessage(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '2:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <AnimatePresence>
      <div
        id="create-playlist-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSubmitting) {
            onClose();
          }
        }}
      >
        <motion.div
          id="create-playlist-modal"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="w-full max-w-md rounded-2xl overlay-panel p-5 flex flex-col gap-4 shadow-2xl border border-[#FF8800]/25 bg-white dark:bg-[#18181B] max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-b-none"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FF8800]/10 flex items-center justify-center text-[#FF8800] shrink-0">
                <ListMusic size={18} />
              </div>
              <div>
                <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Create Playlist
                </h3>
                <p className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                  Organize your music tracks into custom tracklists.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="p-1 text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Optional Track Preview Banner */}
          {variantId && (
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#FF8800]/10 shrink-0 flex items-center justify-center relative">
                {trackPreview?.coverUrl ? (
                  <img
                    src={trackPreview.coverUrl}
                    alt={trackPreview.title || 'Track cover'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music size={18} className="text-[#FF8800]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#FF8800] bg-[#FF8800]/10 px-1.5 py-0.5 rounded">
                    Adding track
                  </span>
                  {trackPreview?.genre && (
                    <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA]">
                      {trackPreview.genre}
                    </span>
                  )}
                </div>
                <h5 className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] truncate mt-0.5">
                  {trackPreview?.title || trackPreview?.prompt || 'Selected Track'}
                </h5>
                <div className="flex items-center gap-2 text-[10px] text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatDuration(trackPreview?.duration)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Name Input */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Playlist Name <span className="text-[#FF8800]">*</span>
                </label>
                <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA]">
                  {name.length}/60
                </span>
              </div>
              <input
                type="text"
                autoFocus
                required
                maxLength={60}
                disabled={isSubmitting}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="e.g. Chill Beats, Workout Energy, Synthwave Night"
                className={`w-full bg-black/5 dark:bg-white/5 border rounded-xl px-3.5 py-2.5 text-xs text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-[#FF8800] transition-colors ${
                  errorMessage
                    ? 'border-[#E23636] focus:border-[#E23636]'
                    : 'border-black/10 dark:border-white/10'
                }`}
              />
            </div>

            {/* Tags Input (Chips) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Tags <span className="text-[10px] font-normal text-[#6B6B75] dark:text-[#A0A0AA]">(optional)</span>
                </label>
                <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA]">
                  {tags.length}/3 tags
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 min-h-[42px]">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#FF8800]/15 text-[#FF8800] border border-[#FF8800]/25"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(idx)}
                      disabled={isSubmitting}
                      className="hover:text-red-500 transition-colors ml-0.5"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}

                {tags.length < 3 && (
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={tags.length === 0 ? 'Type tag & press Enter or comma...' : 'Add tag...'}
                    maxLength={20}
                    className="flex-1 min-w-[100px] bg-transparent border-none text-xs text-[#1A1A1E] dark:text-[#F5F5F7] placeholder-[#6B6B75] dark:placeholder-[#A0A0AA] focus:outline-none py-1 px-1"
                  />
                )}
              </div>
            </div>

            {/* Inline Error */}
            {errorMessage && (
              <div className="flex items-center gap-1.5 text-[11px] text-[#E23636] font-medium pt-0.5">
                <AlertCircle size={13} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/5 dark:border-white/5">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    <span>Create Playlist</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
