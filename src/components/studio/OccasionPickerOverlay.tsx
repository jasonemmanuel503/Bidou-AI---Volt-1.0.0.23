import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Cake,
  HeartHandshake,
  GraduationCap,
  Briefcase,
  Rocket,
  Megaphone,
  Baby,
  Gem,
  Users,
  Heart,
  HandHeart,
  Flower2,
  Sparkles,
  Church,
  TreePine,
  Moon,
  PartyPopper,
  Handshake,
  Trophy,
  Flame,
  X,
  Search,
  ArrowLeft,
  Lock,
  Globe,
  Music,
  Check,
  PenTool,
} from 'lucide-react';
import {
  GROUPS,
  OCCASIONS,
  LANGUAGES,
  UNIVERSAL_FIELDS,
  OccasionDef,
  OccasionSelection,
  OccasionGroupId,
  getOccasion,
  getSub,
  fieldsFor,
  fillTitle,
} from '../../services/occasions';
import { findGenre, tonalityOptions } from '../../services/musicStyles';
import { GradientBorder } from '../common/GradientBorder';

const ICON_MAP: Record<string, React.FC<{ size?: number; className?: string }>> = {
  Cake,
  HeartHandshake,
  GraduationCap,
  Briefcase,
  Rocket,
  Megaphone,
  Baby,
  Gem,
  Users,
  Heart,
  HandHeart,
  Flower2,
  Sparkles,
  Church,
  TreePine,
  Moon,
  PartyPopper,
  Handshake,
  Trophy,
  Flame,
};

export interface OccasionPickerOverlayProps {
  isOpen: boolean;
  initial?: OccasionSelection | null;
  currentLanguage: string;
  onClose: () => void;
  onApply: (r: {
    selection: OccasionSelection;
    genre: string;
    tonality: string;
    title: string;
    language: string;
    writeLyrics: boolean;
  }) => void;
}

export const OccasionPickerOverlay: React.FC<OccasionPickerOverlayProps> = ({
  isOpen,
  initial,
  currentLanguage,
  onClose,
  onApply,
}) => {
  const prefersReducedMotion = useReducedMotion();

  // Step 1: select occasion | Step 2: fill details & style
  const [step, setStep] = useState<1 | 2>(initial ? 2 : 1);
  const [selectedGroupId, setSelectedGroupId] = useState<OccasionGroupId | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedOccasionId, setSelectedOccasionId] = useState<string>(initial?.id || '');
  const [selectedSubId, setSelectedSubId] = useState<string | undefined>(initial?.subId);
  const [details, setDetails] = useState<Record<string, string>>(initial?.details || {});

  const [genre, setGenre] = useState<string>('');
  const [tonality, setTonality] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [language, setLanguage] = useState<string>(currentLanguage || 'English');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initial) {
        setSelectedOccasionId(initial.id);
        setSelectedSubId(initial.subId);
        setDetails(initial.details || {});
        const def = getOccasion(initial.id);
        const sub = getSub(def, initial.subId);
        setGenre(sub?.genre || def?.genre || 'Afrobeats');
        setTonality(sub?.tonality || def?.tonality || 'Celebratory & Energetic');
        const initialTitle = def ? fillTitle(def, initial.details || {}) : '';
        setTitle(initialTitle);
        setTitleManuallyEdited(false);
        setLanguage(initial.details?.language || currentLanguage || 'English');
        setStep(2);
      } else {
        setSelectedOccasionId('');
        setSelectedSubId(undefined);
        setDetails({});
        setGenre('');
        setTonality('');
        setTitle('');
        setTitleManuallyEdited(false);
        setLanguage(currentLanguage || 'English');
        setStep(1);
      }
      setSearchQuery('');
      setSelectedGroupId('all');
    }
  }, [isOpen, initial, currentLanguage]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const activeDef = useMemo(() => getOccasion(selectedOccasionId), [selectedOccasionId]);
  const activeSub = useMemo(() => getSub(activeDef, selectedSubId), [activeDef, selectedSubId]);

  // Filtered occasions list
  const filteredOccasions = useMemo(() => {
    return OCCASIONS.filter((occ) => {
      const matchesGroup = selectedGroupId === 'all' || occ.group === selectedGroupId;
      const matchesSearch =
        !searchQuery.trim() ||
        occ.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        occ.blurb.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (occ.subs && occ.subs.some((s) => s.label.toLowerCase().includes(searchQuery.toLowerCase())));
      return matchesGroup && matchesSearch;
    });
  }, [selectedGroupId, searchQuery]);

  // When occasion is selected in Step 1
  const handleSelectOccasion = (occ: OccasionDef) => {
    setSelectedOccasionId(occ.id);
    const firstSub = occ.subs?.[0]?.id;
    setSelectedSubId(firstSub);
    const subDef = getSub(occ, firstSub);

    const initialGenre = subDef?.genre || occ.genre;
    const initialTonality = subDef?.tonality || occ.tonality;
    setGenre(initialGenre);
    setTonality(initialTonality);

    const newDetails: Record<string, string> = { language };
    setDetails(newDetails);
    setTitle(fillTitle(occ, newDetails));
    setTitleManuallyEdited(false);
    setStep(2);
  };

  // When sub-option is toggled
  const handleSelectSub = (subId: string) => {
    setSelectedSubId(subId);
    if (!activeDef) return;
    const subDef = getSub(activeDef, subId);
    if (subDef?.genre) setGenre(subDef.genre);
    if (subDef?.tonality) setTonality(subDef.tonality);

    if (!titleManuallyEdited) {
      setTitle(fillTitle(activeDef, details));
    }
  };

  // Detail field updates
  const handleDetailChange = (key: string, val: string) => {
    const updated = { ...details, [key]: val };
    setDetails(updated);
    if (activeDef && !titleManuallyEdited) {
      setTitle(fillTitle(activeDef, updated));
    }
  };

  // Check required name field for the primary button
  const activeFields = useMemo(() => {
    return activeDef ? fieldsFor(activeDef, selectedSubId) : [];
  }, [activeDef, selectedSubId]);

  const firstFieldKey = activeFields[0]?.key;
  const isFirstFieldRequiredName = [
    'recipientName',
    'coupleNames',
    'deceasedName',
    'babyName',
    'businessName',
    'teamName',
  ].includes(firstFieldKey);

  const isPrimaryDisabled =
    !activeDef || (isFirstFieldRequiredName && !details[firstFieldKey]?.trim());

  // Applying selection
  const handleApply = (writeLyrics: boolean) => {
    if (!activeDef) return;
    const finalDetails: Record<string, string> = {
      ...details,
      language,
    };

    const selection: OccasionSelection = {
      id: activeDef.id,
      subId: selectedSubId,
      details: finalDetails,
    };

    onApply({
      selection,
      genre: genre || activeDef.genre,
      tonality: tonality || activeDef.tonality,
      title: title.trim() || fillTitle(activeDef, finalDetails),
      language,
      writeLyrics,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="occasion-picker-title"
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-3xl max-h-[92dvh] sm:max-h-[88vh] bg-[#FFFFFF] dark:bg-[#18181B] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-black/10 dark:border-white/10 pb-[env(safe-area-inset-bottom)] overscroll-contain"
      >
        {/* Mobile Drag Handle Bar */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20" />
        </div>

        {/* Modal Sticky Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-black/5 dark:border-white/5 bg-[#FFFFFF]/90 dark:bg-[#18181B]/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="p-1.5 -ml-1 rounded-xl text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                title="Back to occasion list"
                aria-label="Back to occasion list"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="flex flex-col min-w-0">
              <h2
                id="occasion-picker-title"
                className="text-base sm:text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate font-sans"
              >
                {step === 1 ? 'Create Song for an Occasion' : activeDef?.label}
              </h2>
              <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] truncate">
                {step === 1
                  ? 'Choose a life milestone, celebration or sacred moment'
                  : activeDef?.blurb}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
          {step === 1 ? (
            /* ========================================================================= */
            /* STEP 1: CHOOSE OCCASION                                                   */
            /* ========================================================================= */
            <div className="flex flex-col gap-4">
              {/* Search Box */}
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E8E98] dark:text-[#71717A]"
                />
                <input
                  type="text"
                  placeholder="Search occasions (e.g. Birthday, Wedding, Funeral, Launch…)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl glass-panel text-base sm:text-sm text-[#1A1A1E] dark:text-[#F5F5F7] placeholder-[#8E8E98] dark:placeholder-[#71717A] focus:outline-none focus:ring-1 focus:ring-[#F86A00]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Group Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedGroupId('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedGroupId === 'all'
                      ? 'bg-[#F86A00] text-white shadow-sm shadow-[#F86A00]/25'
                      : 'glass-panel text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  All ({OCCASIONS.length})
                </button>
                {GROUPS.map((grp) => {
                  const count = OCCASIONS.filter((o) => o.group === grp.id).length;
                  const isSelected = selectedGroupId === grp.id;
                  return (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => setSelectedGroupId(grp.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#F86A00] text-white shadow-sm shadow-[#F86A00]/25'
                          : 'glass-panel text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                      }`}
                    >
                      {grp.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Occasion Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
                {filteredOccasions.map((occ) => {
                  const IconComp = ICON_MAP[occ.icon] || Sparkles;
                  const isSelected = selectedOccasionId === occ.id;

                  const cardInner = (
                    <button
                      type="button"
                      onClick={() => handleSelectOccasion(occ)}
                      className={`w-full min-h-[105px] sm:min-h-[115px] p-3 rounded-2xl flex flex-col justify-between text-left transition-all cursor-pointer group ${
                        isSelected
                          ? 'bg-gradient-to-b from-[#F86A00]/15 to-transparent text-[#1A1A1E] dark:text-[#F5F5F7]'
                          : 'glass-panel hover:border-[#F86A00]/40 text-[#1A1A1E] dark:text-[#F5F5F7]'
                      }`}
                    >
                      <div className="flex items-start justify-between w-full">
                        <div
                          className={`p-2 rounded-xl transition-transform group-hover:scale-110 ${
                            isSelected
                              ? 'bg-[#F86A00] text-white'
                              : 'bg-black/5 dark:bg-white/5 text-[#F86A00]'
                          }`}
                        >
                          <IconComp size={18} />
                        </div>
                        {occ.privacy === 'force_private' ? (
                          <Lock size={12} className="text-[#8E8E98] dark:text-[#71717A] mt-1" />
                        ) : null}
                      </div>

                      <div className="flex flex-col mt-2">
                        <span className="text-xs font-bold leading-tight group-hover:text-[#F86A00] transition-colors line-clamp-1">
                          {occ.label}
                        </span>
                        <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] line-clamp-1 leading-snug">
                          {occ.blurb}
                        </span>
                      </div>
                    </button>
                  );

                  return isSelected ? (
                    <GradientBorder
                      key={occ.id}
                      mode="always"
                      radius={16}
                      thickness={1.5}
                      glow
                      className="w-full"
                    >
                      {cardInner}
                    </GradientBorder>
                  ) : (
                    <div key={occ.id}>{cardInner}</div>
                  );
                })}
              </div>

              {filteredOccasions.length === 0 && (
                <div className="py-12 text-center text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                  No occasions found matching &quot;{searchQuery}&quot;
                </div>
              )}
            </div>
          ) : (
            /* ========================================================================= */
            /* STEP 2: DETAILS & STYLE FOR SELECTED OCCASION                             */
            /* ========================================================================= */
            <div className="flex flex-col gap-5">
              {/* Privacy Notice Banner */}
              {activeDef?.privacy === 'force_private' ? (
                <div className="flex items-center gap-2 p-2.5 px-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium">
                  <Lock size={14} className="shrink-0" />
                  <span>This song is private to you.</span>
                </div>
              ) : activeDef?.privacy === 'default_private' ? (
                <div className="flex items-center gap-2 p-2.5 px-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#6B6B75] dark:text-[#A0A0AA] text-xs">
                  <Lock size={14} className="shrink-0" />
                  <span>Private by default — you can share it later.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 px-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
                  <Globe size={14} className="shrink-0" />
                  <span>Public celebration anthem — ready to share or keep private.</span>
                </div>
              )}

              {/* Jingle / Launch Hook Notice */}
              {(activeDef?.id === 'jingle' || activeDef?.id === 'business_launch') && (
                <div className="flex items-center gap-2 p-2.5 px-3.5 rounded-xl bg-[#F86A00]/10 border border-[#F86A00]/20 text-[#F86A00] text-xs font-semibold">
                  <Sparkles size={14} className="shrink-0" />
                  <span>Short, catchy and hook-first arrangement.</span>
                </div>
              )}

              {/* Sub-option Chips (if applicable) */}
              {activeDef?.subs && activeDef.subs.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Select Type / Focus
                  </label>
                  <div className="flex items-center flex-wrap gap-2">
                    {activeDef.subs.map((sub) => {
                      const isSelected = (selectedSubId || activeDef.subs?.[0].id) === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleSelectSub(sub.id)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#F86A00] text-white shadow-sm shadow-[#F86A00]/25'
                              : 'glass-panel text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                          }`}
                        >
                          {isSelected && <Check size={12} />}
                          <span>{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dynamic Occasion Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {activeFields.map((field) => {
                  const val = details[field.key] || '';
                  const isRequired =
                    field.key === firstFieldKey && isFirstFieldRequiredName;

                  if (field.type === 'select') {
                    return (
                      <div key={field.key} className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                          {field.label} {isRequired && <span className="text-[#F86A00]">*</span>}
                        </label>
                        <select
                          value={field.key === 'language' ? language : val}
                          onChange={(e) => {
                            if (field.key === 'language') {
                              setLanguage(e.target.value);
                            }
                            handleDetailChange(field.key, e.target.value);
                          }}
                          className="w-full px-3 py-2 rounded-xl glass-panel text-base sm:text-xs text-[#1A1A1E] dark:text-[#F5F5F7] bg-white dark:bg-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#F86A00]"
                        >
                          {(field.options || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  if (field.type === 'textarea') {
                    return (
                      <div key={field.key} className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                          {field.label} {isRequired && <span className="text-[#F86A00]">*</span>}
                        </label>
                        <textarea
                          rows={2}
                          placeholder={field.placeholder}
                          value={val}
                          maxLength={field.maxLen}
                          onChange={(e) => handleDetailChange(field.key, e.target.value)}
                          className="w-full px-3 py-2 rounded-xl glass-panel text-base sm:text-xs text-[#1A1A1E] dark:text-[#F5F5F7] placeholder-[#8E8E98] dark:placeholder-[#71717A] focus:outline-none focus:ring-1 focus:ring-[#F86A00] resize-none"
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                        {field.label} {isRequired && <span className="text-[#F86A00]">*</span>}
                      </label>
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        placeholder={field.placeholder}
                        value={val}
                        maxLength={field.maxLen}
                        onChange={(e) => handleDetailChange(field.key, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl glass-panel text-base sm:text-xs text-[#1A1A1E] dark:text-[#F5F5F7] placeholder-[#8E8E98] dark:placeholder-[#71717A] focus:outline-none focus:ring-1 focus:ring-[#F86A00]"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Style & Title Row */}
              <div className="p-3.5 rounded-2xl glass-panel bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#F86A00]">
                  <Music size={14} />
                  <span>Musical Style & Song Title</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Genre Picker (filtered to occasion's allowed choices) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                      Genre
                    </label>
                    <select
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl glass-panel text-base sm:text-xs text-[#1A1A1E] dark:text-[#F5F5F7] bg-white dark:bg-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#F86A00]"
                    >
                      {(activeDef?.genreChoices || []).map((g) => {
                        const style = findGenre(g);
                        return (
                          <option key={g} value={g}>
                            {style?.label || g}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Vibe / Tonality Picker */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                      Vibe & Emotion
                    </label>
                    <select
                      value={tonality}
                      onChange={(e) => setTonality(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl glass-panel text-base sm:text-xs text-[#1A1A1E] dark:text-[#F5F5F7] bg-white dark:bg-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#F86A00]"
                    >
                      {tonalityOptions().map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Generated / Editable Song Title */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                      Song Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setTitleManuallyEdited(true);
                      }}
                      placeholder="Title will appear here"
                      className="w-full px-3 py-2 rounded-xl glass-panel text-base sm:text-xs text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:ring-1 focus:ring-[#F86A00]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Sticky Footer */}
        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-2.5 px-4 sm:px-6 py-3 border-t border-black/5 dark:border-white/5 bg-[#FFFFFF]/90 dark:bg-[#18181B]/90 backdrop-blur-md">
          {step === 1 ? (
            <div className="text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
              Select an occasion card to continue
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-3 py-2 rounded-xl glass-panel text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] transition-colors cursor-pointer"
            >
              Back
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {step === 2 && (
              <>
                <button
                  type="button"
                  onClick={() => handleApply(true)}
                  disabled={isPrimaryDisabled}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl glass-panel border border-[#F86A00]/40 text-xs font-bold text-[#F86A00] hover:bg-[#F86A00]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Apply occasion and automatically write lyrics"
                >
                  <PenTool size={13} />
                  <span className="hidden sm:inline">Use &amp; Write My Lyrics</span>
                  <span className="sm:hidden">Write Lyrics</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApply(false)}
                  disabled={isPrimaryDisabled}
                  className="px-4 sm:px-5 py-2 rounded-xl bg-brand-gradient text-white text-xs font-bold shadow-md shadow-[#F86A00]/25 hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Use this occasion
                </button>
              </>
            )}

            {step === 1 && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl glass-panel text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
