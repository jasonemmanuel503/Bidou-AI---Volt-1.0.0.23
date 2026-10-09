/**
 * src/components/studio/CoverArtStudioModal.tsx
 *
 * Plain-language summary:
 * AI Cover Art v2 interactive studio modal for music producers on Bidou AI:
 * - 3-step creation flow:
 *   1. Artist portrait photo (optional) with required likeness consent checkbox
 *   2. Curated Style Library cards (Afrobeats, Amapiano, Afro-Trap, Gospel, etc.)
 *   3. Engine Tier selector (Standard 240 credits vs Pro 500 credits for 2 options)
 * - Real-time polling with progress animation (every 2s until done)
 * - Dual-version comparison preview
 * - FREE instant re-compositing of Title, Artist Name, Font, and Layout (0 credits, no AI call)
 * - Selection attaching `cover_art_url` directly to the track.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Upload,
  Check,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Type,
  Layout,
  Music,
  User,
  AlertCircle,
  Eye,
  Zap,
  Crown,
} from 'lucide-react';
import {
  COVER_ART_FONTS,
  COVER_ART_LAYOUTS,
  COVER_ART_STYLES,
  COVER_ART_TIERS,
  CoverArtJobDto,
  CoverArtOptionsResponse,
  CoverArtTierId,
  CoverArtVersionDto,
} from '../../services/coverArtCatalog';
import {
  apiCreateCoverArt,
  apiGetCoverArtJob,
  apiGetCoverArtOptions,
  apiRecompositeCoverArt,
  apiSelectCoverArtVersion,
} from '../../services/apiClient';

interface CoverArtStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackTitle: string;
  artistName: string;
  genre: string;
  walletBalance?: number;
  onCoverSelected: (coverUrl: string) => void;
  onRequireCredits?: (required: number, available: number) => void;
}

export const CoverArtStudioModal: React.FC<CoverArtStudioModalProps> = ({
  isOpen,
  onClose,
  trackTitle,
  artistName: initialArtistName,
  genre,
  walletBalance = 0,
  onCoverSelected,
  onRequireCredits,
}) => {
  // Form State
  const [title, setTitle] = useState(trackTitle || 'Single');
  const [artistName, setArtistName] = useState(initialArtistName || '');
  const [selectedStyleId, setSelectedStyleId] = useState('afrobeats-vibrant');
  const [selectedTier, setSelectedTier] = useState<CoverArtTierId>('standard');
  const [selectedFontId, setSelectedFontId] = useState('urban-bold');
  const [selectedLayoutId, setSelectedLayoutId] = useState('bottom-centered');

  // Photo Reference
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Options from server
  const [serverOptions, setServerOptions] = useState<CoverArtOptionsResponse | null>(null);

  // Job & Generation State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<CoverArtJobDto | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecompositing, setIsRecompositing] = useState(false);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditingTypography, setIsEditingTypography] = useState(false);

  // Sync props when opening
  useEffect(() => {
    if (isOpen) {
      if (trackTitle) setTitle(trackTitle);
      if (initialArtistName) setArtistName(initialArtistName);
      setErrorMessage(null);
    }
  }, [isOpen, trackTitle, initialArtistName]);

  // Fetch options & authoritative server pricing
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    apiGetCoverArtOptions()
      .then((opts) => {
        if (isMounted) {
          setServerOptions(opts);
          if (!opts.isStandardTierAvailable) {
            setSelectedTier('pro');
          }
        }
      })
      .catch((err) => {
        console.warn('[CoverArtModal] Could not fetch server options:', err?.message);
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Handle Photo File Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file (JPEG, PNG, or WebP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('Image file must be under 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoDataUrl(event.target?.result as string);
      setPhotoConsent(false); // require user to check consent
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoDataUrl(null);
    setPhotoConsent(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Launch Generation Job
  const handleStartGeneration = async () => {
    if (!title.trim()) {
      setErrorMessage('Song title is required.');
      return;
    }

    if (photoDataUrl && !photoConsent) {
      setErrorMessage('You must confirm consent to use the uploaded photo for AI artwork generation.');
      return;
    }

    const tierConfig = serverOptions?.tiers[selectedTier] || COVER_ART_TIERS[selectedTier];
    if (walletBalance < tierConfig.creditCost) {
      if (onRequireCredits) {
        onRequireCredits(tierConfig.creditCost, walletBalance);
      } else {
        setErrorMessage(`Insufficient credits. You need ${tierConfig.creditCost} credits (balance: ${walletBalance}).`);
      }
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setActiveJob(null);

    try {
      const resp = await apiCreateCoverArt({
        title: title.trim(),
        artistName: artistName.trim(),
        genre: genre || 'Afrobeats',
        tier: selectedTier,
        styleId: selectedStyleId,
        fontId: selectedFontId,
        layoutId: selectedLayoutId,
        photoDataUrl: photoDataUrl || null,
        photoConsent,
      });

      setActiveJobId(resp.id);
    } catch (err: any) {
      setIsGenerating(false);
      if (err.message === 'INSUFFICIENT_CREDITS' && onRequireCredits) {
        onRequireCredits(tierConfig.creditCost, walletBalance);
      } else {
        setErrorMessage(err.message || 'Failed to start cover art generation.');
      }
    }
  };

  // Polling Effect
  useEffect(() => {
    if (!activeJobId || !isGenerating) return;

    let timer: any = null;
    let isMounted = true;

    const poll = async () => {
      try {
        const job = await apiGetCoverArtJob(activeJobId);
        if (!isMounted) return;

        setActiveJob(job);

        if (job.status === 'completed') {
          setIsGenerating(false);
          setSelectedVersionIdx(0);
        } else if (job.status === 'failed') {
          setIsGenerating(false);
          setErrorMessage(job.errorMessage || 'Generation failed. Your credits were automatically refunded.');
        } else {
          timer = setTimeout(poll, 2000);
        }
      } catch (pollErr: any) {
        if (!isMounted) return;
        timer = setTimeout(poll, 2500);
      }
    };

    poll();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [activeJobId, isGenerating]);

  // Free Re-compositing
  const handleRecomposite = async () => {
    if (!activeJob) return;
    setIsRecompositing(true);
    setErrorMessage(null);

    try {
      const res = await apiRecompositeCoverArt(activeJob.id, {
        title: title.trim(),
        artistName: artistName.trim(),
        fontId: selectedFontId,
        layoutId: selectedLayoutId,
      });
      setActiveJob(res.job);
      setIsEditingTypography(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to re-composite artwork.');
    } finally {
      setIsRecompositing(false);
    }
  };

  // Final Selection
  const handleSelectWinningCover = async (idx: number) => {
    if (!activeJob) return;
    try {
      const chosen = await apiSelectCoverArtVersion(activeJob.id, idx);
      onCoverSelected(chosen.coverUrl);
      onClose();
    } catch (err: any) {
      // Fallback to direct URL if select endpoint errored
      const fallbackUrl = activeJob.versions[idx]?.imageUrl;
      if (fallbackUrl) {
        onCoverSelected(fallbackUrl);
        onClose();
      } else {
        setErrorMessage('Could not select cover art version.');
      }
    }
  };

  if (!isOpen) return null;

  const currentTiers = serverOptions?.tiers || COVER_ART_TIERS;
  const currentStyles = serverOptions?.styles || COVER_ART_STYLES;
  const currentFonts = serverOptions?.fonts || COVER_ART_FONTS;
  const currentLayouts = serverOptions?.layouts || COVER_ART_LAYOUTS;
  const activeTierConfig = currentTiers[selectedTier] || COVER_ART_TIERS.standard;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#141416] border border-[#27272A] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272A] bg-[#18181B]/80 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF8800] to-[#F86A00] flex items-center justify-center shadow-lg shadow-[#FF8800]/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                Cover Art Studio <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30">v2</span>
              </h2>
              <p className="text-xs text-[#A1A1AA]">
                Finished album artwork & typography in 2 options · Sharp compositing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white hover:bg-[#27272A] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* VIEW 1: CREATION FORM (when no completed job yet) */}
          {!activeJob || activeJob.status !== 'completed' ? (
            <div className="space-y-6">
              {/* Step 1: Artist & Track Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#D4D4D8] mb-1.5 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-[#FF8800]" /> Song Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Kupe Anthem"
                    disabled={isGenerating}
                    className="w-full px-3.5 py-2.5 bg-[#1C1C1F] border border-[#2E2E32] rounded-xl text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#FF8800] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#D4D4D8] mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#FF8800]" /> Artist Name
                  </label>
                  <input
                    type="text"
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                    placeholder="e.g. Stanley Enow, Libianca"
                    disabled={isGenerating}
                    className="w-full px-3.5 py-2.5 bg-[#1C1C1F] border border-[#2E2E32] rounded-xl text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#FF8800] transition-colors"
                  />
                </div>
              </div>

              {/* Step 2: Artist Portrait Photo (Optional Reference) */}
              <div className="p-4 rounded-xl bg-[#18181B] border border-[#27272A] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5 text-[#FF8800]" /> Artist Reference Photo (Optional)
                  </span>
                  <span className="text-[11px] text-[#A1A1AA]">Preserves likeness & posture in artwork</span>
                </div>

                {!photoDataUrl ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-[#3F3F46] hover:border-[#FF8800] rounded-xl p-4 text-center cursor-pointer transition-colors bg-[#141416]/50 hover:bg-[#1C1C1F]"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <Upload className="w-5 h-5 mx-auto text-[#71717A] mb-1.5" />
                    <p className="text-xs text-[#D4D4D8] font-medium">Click to upload artist photo</p>
                    <p className="text-[10px] text-[#71717A] mt-0.5">JPEG, PNG or WebP up to 8MB</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 bg-[#141416] p-2.5 rounded-xl border border-[#2E2E32]">
                      <img
                        src={photoDataUrl}
                        alt="Artist portrait reference"
                        className="w-14 h-14 rounded-lg object-cover border border-[#3F3F46]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">Artist Reference Attached</p>
                        <p className="text-[10px] text-[#A1A1AA]">Used for facial structure & skin tone guidance</p>
                      </div>
                      <button
                        onClick={removePhoto}
                        disabled={isGenerating}
                        className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        Remove
                      </button>
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer bg-[#1C1C1F] p-2.5 rounded-xl border border-[#2E2E32]">
                      <input
                        type="checkbox"
                        checked={photoConsent}
                        onChange={(e) => setPhotoConsent(e.target.checked)}
                        disabled={isGenerating}
                        className="mt-0.5 accent-[#FF8800] rounded"
                      />
                      <span className="text-[11px] text-[#D4D4D8] leading-tight">
                        I confirm this is my photo or I have legal authorization to use this person's likeness for album cover artwork generation.
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Step 3: Curated Style Cards */}
              <div>
                <label className="block text-xs font-semibold text-[#D4D4D8] mb-2.5">
                  Select Visual Style Recipe
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {currentStyles.map((style) => {
                    const isSelected = selectedStyleId === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setSelectedStyleId(style.id)}
                        disabled={isGenerating}
                        className={`text-left p-3 rounded-xl border transition-all relative ${
                          isSelected
                            ? 'bg-[#1F1F24] border-[#FF8800] ring-1 ring-[#FF8800] shadow-lg shadow-[#FF8800]/10'
                            : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46] opacity-80 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: style.colorPalette[0] }}
                          />
                          <p className="text-xs font-bold text-white truncate">{style.label}</p>
                        </div>
                        <p className="text-[10px] text-[#A1A1AA] line-clamp-2 leading-relaxed">
                          {style.description}
                        </p>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#FF8800] flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-black font-bold" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 4: Tier Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#D4D4D8] mb-2.5">
                  Choose Engine Tier (2 options generated)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Standard */}
                  <button
                    type="button"
                    onClick={() => setSelectedTier('standard')}
                    disabled={isGenerating || !serverOptions?.isStandardTierAvailable}
                    className={`p-3.5 rounded-xl border text-left transition-all relative ${
                      selectedTier === 'standard'
                        ? 'bg-[#1F1F24] border-[#FF8800] ring-1 ring-[#FF8800]'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    } ${!serverOptions?.isStandardTierAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-[#FF8800]" />
                        <span className="text-sm font-bold text-white">{currentTiers.standard.name}</span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#FF8800]/20 text-[#FF8800]">
                        {currentTiers.standard.creditCost} Credits
                      </span>
                    </div>
                    <p className="text-xs text-[#D4D4D8] font-medium mb-0.5">{currentTiers.standard.engineName}</p>
                    <p className="text-[11px] text-[#A1A1AA]">{currentTiers.standard.description}</p>
                    <p className="text-[10px] text-[#71717A] mt-2">Delivers 2 parallel covers to choose from</p>
                  </button>

                  {/* Pro */}
                  <button
                    type="button"
                    onClick={() => setSelectedTier('pro')}
                    disabled={isGenerating}
                    className={`p-3.5 rounded-xl border text-left transition-all relative ${
                      selectedTier === 'pro'
                        ? 'bg-[#1F1F24] border-[#FF8800] ring-1 ring-[#FF8800]'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-[#FFD700]" />
                        <span className="text-sm font-bold text-white">{currentTiers.pro.name}</span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#FFD700]/20 text-[#FFD700]">
                        {currentTiers.pro.creditCost} Credits
                      </span>
                    </div>
                    <p className="text-xs text-[#D4D4D8] font-medium mb-0.5">{currentTiers.pro.engineName}</p>
                    <p className="text-[11px] text-[#A1A1AA]">{currentTiers.pro.description}</p>
                    <p className="text-[10px] text-[#71717A] mt-2">Delivers 2 parallel studio-grade covers</p>
                  </button>
                </div>
              </div>

              {/* Progress Indicator when Generating */}
              {isGenerating && (
                <div className="p-5 rounded-xl bg-[#1C1C1F] border border-[#FF8800]/40 text-center space-y-3 animate-pulse">
                  <div className="flex items-center justify-center gap-2 text-sm font-bold text-[#FF8800]">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating 2 Cover Art Options with {activeTierConfig.engineName}...
                  </div>
                  <p className="text-xs text-[#A1A1AA]">
                    Art director prompt → Dual-engine generation → Sharp quality verification → Vector typography compositing.
                  </p>
                  <div className="w-full bg-[#27272A] h-1.5 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-[#FF8800] to-[#F86A00] h-full w-2/3 animate-[pulse_1s_infinite]" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* VIEW 2: RESULTS VIEW WITH 2 VERSIONS & FREE RE-COMPOSITING */
            <div className="space-y-6">
              {/* Top Banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#18181B] border border-[#27272A]">
                <div>
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 2 Cover Versions Ready
                  </span>
                  <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                    Click "Select This Cover" to apply to your track, or use Free Edits to adjust typography.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingTypography(!isEditingTypography)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#27272A] hover:bg-[#323236] text-white flex items-center gap-1.5 transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#FF8800]" />
                  {isEditingTypography ? 'Hide Typography Controls' : 'Edit Text & Layout (Free)'}
                </button>
              </div>

              {/* Free Typography & Layout Editing Drawer */}
              {isEditingTypography && (
                <div className="p-4 rounded-xl bg-[#1C1C1F] border border-[#FF8800]/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-[#FF8800]" /> Free Typography & Layout Adjustment
                    </h3>
                    <span className="text-[10px] text-[#A1A1AA]">0 Credits · Instant re-composite without AI re-render</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#A1A1AA] mb-1">Song Title</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-[#141416] border border-[#2E2E32] rounded-lg text-xs text-white focus:outline-none focus:border-[#FF8800]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A1A1AA] mb-1">Artist Name</label>
                      <input
                        type="text"
                        value={artistName}
                        onChange={(e) => setArtistName(e.target.value)}
                        className="w-full px-3 py-2 bg-[#141416] border border-[#2E2E32] rounded-lg text-xs text-white focus:outline-none focus:border-[#FF8800]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#A1A1AA] mb-1">Typography Style</label>
                      <select
                        value={selectedFontId}
                        onChange={(e) => setSelectedFontId(e.target.value)}
                        className="w-full px-3 py-2 bg-[#141416] border border-[#2E2E32] rounded-lg text-xs text-white focus:outline-none focus:border-[#FF8800]"
                      >
                        {currentFonts.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.name} ({font.category})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A1A1AA] mb-1">Cover Layout</label>
                      <select
                        value={selectedLayoutId}
                        onChange={(e) => setSelectedLayoutId(e.target.value)}
                        className="w-full px-3 py-2 bg-[#141416] border border-[#2E2E32] rounded-lg text-xs text-white focus:outline-none focus:border-[#FF8800]"
                      >
                        {currentLayouts.map((lay) => (
                          <option key={lay.id} value={lay.id}>
                            {lay.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingTypography(false)}
                      className="px-3 py-1.5 text-xs text-[#A1A1AA] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRecomposite}
                      disabled={isRecompositing}
                      className="px-4 py-1.5 rounded-lg bg-[#FF8800] hover:bg-[#F86A00] text-black font-bold text-xs flex items-center gap-1.5 transition-colors shadow-lg shadow-[#FF8800]/20"
                    >
                      {isRecompositing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Re-compositing...
                        </>
                      ) : (
                        'Apply Free Edits'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Dual Versions Display */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {activeJob.versions.map((version, vIdx) => {
                  const isCurrentPicked = selectedVersionIdx === vIdx;
                  return (
                    <div
                      key={vIdx}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isCurrentPicked
                          ? 'bg-[#1A1A1E] border-[#FF8800] ring-1 ring-[#FF8800]'
                          : 'bg-[#161619] border-[#27272A]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white">Version {vIdx + 1}</span>
                        <span className="text-[10px] text-[#A1A1AA]">{version.engine}</span>
                      </div>

                      {/* Square Cover Art Preview */}
                      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black/40 border border-[#2E2E32] group">
                        <img
                          src={version.imageUrl}
                          alt={`Cover Art Option ${vIdx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <a
                            href={version.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg bg-black/60 text-white hover:bg-black text-xs font-semibold flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> High-Res
                          </a>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedVersionIdx(vIdx)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                            isCurrentPicked
                              ? 'bg-[#FF8800]/20 text-[#FF8800]'
                              : 'text-[#A1A1AA] hover:text-white'
                          }`}
                        >
                          {isCurrentPicked ? 'Selected' : 'Preview'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectWinningCover(vIdx)}
                          className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#FF8800] to-[#F86A00] hover:from-[#F86A00] hover:to-[#FF8800] text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#FF8800]/20 transition-all"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Select This Cover
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-[#27272A] bg-[#18181B]/80 flex items-center justify-between">
          <div className="text-xs text-[#A1A1AA]">
            Balance:{' '}
            <span className="font-bold text-white">{walletBalance} Credits</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating || isRecompositing}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#A1A1AA] hover:text-white hover:bg-[#27272A] transition-colors"
            >
              {activeJob?.status === 'completed' ? 'Close' : 'Cancel'}
            </button>

            {(!activeJob || activeJob.status !== 'completed') && (
              <button
                type="button"
                onClick={handleStartGeneration}
                disabled={isGenerating}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#FF8800] to-[#F86A00] hover:from-[#F86A00] hover:to-[#FF8800] text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-[#FF8800]/25 transition-all disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Generating 2 Options...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate 2 Options ({activeTierConfig.creditCost} Credits)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
