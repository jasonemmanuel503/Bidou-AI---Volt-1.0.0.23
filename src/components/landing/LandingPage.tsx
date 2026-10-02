import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Zap,
  Globe,
  Layers,
  HelpCircle,
  Users,
  UserCheck,
} from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { ShowcaseCarousel, ShowcaseItem } from './ShowcaseCarousel';
import { BuiltForAfricaSection } from './BuiltForAfricaSection';
import { LandingPricingPreview } from './LandingPricingPreview';
import { BidouLogo } from '../common/BidouLogo';
import { IconTile } from '../common/IconTile';
import { ScrollReveal } from '../common/ScrollReveal';
import { ParticleField } from './ParticleField';
import { CreditPackage } from '../../types';
import { usePlatformStats } from '../../hooks/usePlatformStats';
import { CountUpStat } from '../common/CountUpStat';

export interface LandingPageProps {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  isAuthenticated?: boolean;
  onOpenStudio?: () => void;
  onSignOut?: () => void;
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  onSelectPricingPlan: (pkg: CreditPackage) => void;
  onCompletePayment?: (rail: any, phone: string, pkg: CreditPackage) => Promise<any>;
  onOpenAdmin?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  theme,
  setTheme,
  isAuthenticated = false,
  onOpenStudio,
  onSignOut,
  onOpenSignIn,
  onOpenSignUp,
  onSelectPricingPlan,
  onCompletePayment,
  onOpenAdmin,
}) => {
  // FAQ accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Dynamic platform active users and paid creators stats
  const { stats: platformStats } = usePlatformStats();

  // Showcase Data: Video Items
  const videoShowcaseItems: ShowcaseItem[] = [
    {
      id: 'vid_1',
      type: 'video',
      title: 'Mount Cameroon Golden Mist',
      prompt: 'Cinematic aerial drone flight tracking sunrise clouds through the volcanic valleys of Buea, golden hour sun rays, realistic 60fps',
      model: 'Google Veo 3.1',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-african-savanna-landscape-with-sun-41316-large.mp4',
      author: 'Kevin T.',
      likes: 89,
    },
    {
      id: 'vid_2',
      type: 'video',
      title: 'Clouds & Sky Over Limbe Coast',
      prompt: 'Slow motion cinematic waves and coastal mist rolling over volcanic black sand beaches, ultra-detailed water physics',
      model: 'Google Veo 3.1',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4',
      author: 'Amina D.',
      likes: 134,
    },
    {
      id: 'vid_3',
      type: 'video',
      title: 'Savanna Twilight Flight',
      prompt: 'High-speed sweeping cinematic camera across glowing golden acacia trees at dusk with silhouettes in the distance',
      model: 'Google Veo 3.1',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-african-savanna-landscape-with-sun-41316-large.mp4',
      author: 'Samuel K.',
      likes: 112,
    },
    {
      id: 'vid_4',
      type: 'video',
      title: 'Highland Ridge Time-Lapse',
      prompt: 'Volumetric clouds cascading across lush green African ridges with shifting sunlight and atmospheric depth',
      model: 'Google Veo 3.1',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4',
      author: 'Yannick N.',
      likes: 95,
    },
  ];

  // Showcase Data: Image Items
  const imageShowcaseItems: ShowcaseItem[] = [
    {
      id: 'img_1',
      type: 'image',
      title: 'Afrofuturistic Royal Queen',
      prompt: 'Regal African queen with intricate luminous gold and glowing cyan headpiece, high fashion editorial, volumetric studio lighting, 8k resolution textures',
      model: 'Google Nano Banana',
      mediaUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
      author: 'Amina D.',
      likes: 142,
    },
    {
      id: 'img_2',
      type: 'image',
      title: 'Yaoundé Cyberpunk Street Market',
      prompt: 'Bustling night market in Yaoundé with holograms of African geometric patterns, wet neon asphalt reflections, highly detailed street atmosphere',
      model: 'Google Nano Banana',
      mediaUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
      author: 'Samuel K.',
      likes: 97,
    },
    {
      id: 'img_3',
      type: 'image',
      title: 'Sahel High-Fashion Indigo Portrait',
      prompt: 'Nomadic fashion model draped in layered deep indigo tie-dye textiles, dramatic sunlight, sharp facial features, editorial Vogue Africa cover',
      model: 'Google Nano Banana Pro',
      mediaUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&auto=format&fit=crop&q=80',
      author: 'Fatou S.',
      likes: 184,
    },
    {
      id: 'img_4',
      type: 'image',
      title: 'Futuristic Douala Waterfront Marina',
      prompt: 'Futuristic solar-powered catamaran docking in Douala harbor, gleaming glass architecture blended with wood carvings, cinematic sunset',
      model: 'Google Nano Banana Pro',
      mediaUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
      author: 'Roger M.',
      likes: 120,
    },
    {
      id: 'img_5',
      type: 'image',
      title: 'Bamenda Highlands Coffee Harvest',
      prompt: 'Warm morning light glowing through lush green coffee plantation terraces, focused African agriculturalist in traditional woven hat',
      model: 'Google Nano Banana',
      mediaUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80',
      author: 'Nadine F.',
      likes: 78,
    },
  ];

  // Showcase Data: Music Items
  const musicShowcaseItems: ShowcaseItem[] = [
    {
      id: 'mus_1',
      type: 'music',
      title: 'Douala Sunset Groove',
      prompt: 'Makossa acoustic bassline combined with smooth brass horns and celebratory vocals singing about evening joy on the Wouri coast',
      model: 'Google Lyria 3 Pro',
      mediaUrl: '/samples/demo-track.mp3',
      author: 'Yannick N.',
      genre: 'Makossa',
      likes: 215,
    },
    {
      id: 'mus_2',
      type: 'music',
      title: 'Yaoundé Street Fire Pulse',
      prompt: 'Fast-paced Mbolé street rhythm with polyrhythmic acoustic percussion, whistles, heavy kick, and energetic call-and-response chanting',
      model: 'Google Lyria 3 Pro',
      mediaUrl: '/samples/demo-track-2.mp3',
      author: 'Junior B.',
      genre: 'Mbolé',
      likes: 198,
    },
    {
      id: 'mus_3',
      type: 'music',
      title: 'Amapiano Coastal Drift',
      prompt: 'Warm log drum bassline, airy synth pads, delicate shakers and soulful vocal chops for a chilled Douala lounge vibe',
      model: 'Google Lyria 3 Pro',
      mediaUrl: '/samples/demo-track.mp3',
      author: 'Sipho K.',
      genre: 'Amapiano',
      likes: 164,
    },
    {
      id: 'mus_4',
      type: 'music',
      title: 'Bikutsi Midnight Thunder',
      prompt: 'Lightning-fast 6/8 time signature balafon riffs, driving bass guitar, and polyrhythmic Cameroonian percussion',
      model: 'Google Lyria 3 Pro',
      mediaUrl: '/samples/demo-track-2.mp3',
      author: 'Marcelle O.',
      genre: 'Bikutsi',
      likes: 147,
    },
  ];

  // FAQ Items
  const faqs = [
    {
      question: 'How does payment with MTN Mobile Money and Orange Money work?',
      answer:
        'You can purchase credit packs directly on-demand using your local mobile phone number. Our payment integration initiates an instant USSD authorization prompt on your handset (or SMS OTP code). Once confirmed, your Universal Wallet is credited within 3-5 seconds with zero foreign exchange markup.',
    },
    {
      question: 'What are Universal Credits?',
      answer:
        'Instead of siloed balances where video credits cannot be used for images or songs, Bidou AI uses a single Universal Wallet. Paid credit packs start at 2,000 FCFA (1,500 credits), 5,400 FCFA (5,500 credits), 16,000 FCFA (18,000 credits), and 42,000 FCFA (53,000 credits), and can be spent flexibly across image models (from 10 credits), video models (from 310 credits), or full studio songs (from 150 credits for 2 takes).',
    },
    {
      question: 'Which state-of-the-art AI models power Bidou AI?',
      answer:
        'We deploy Google Nano Banana and FLUX for photorealistic imagery, Google Veo 3.1 and Alibaba Wan 3.0 for fluid video synthesis, and Google Lyria 3 Pro combined with specialized African rhythm engines for studio-grade music production.',
    },
    {
      question: 'Do I own commercial rights to the media I generate?',
      answer:
        'Yes! All paid and credited generations come with full commercial rights. You can use your synthesized images, videos, and music for client campaigns, streaming platforms (Spotify, Apple Music, YouTube), film productions, and brand marketing.',
    },
    {
      question: 'Can I start for free?',
      answer:
        'Every new creator receives 500 free welcome credits for fast image models upon account registration — enough to generate fast 1K images immediately with zero payment info required.',
    },
  ];

  const handleScrollToPricing = () => {
    const el = document.getElementById('pricing-preview');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-[#FFFFFF] dark:bg-[#121214] text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors duration-200 overflow-hidden">
      {/* Ambient floating embers / particles */}
      <ParticleField count={28} />

      {/* 2.2 Dedicated Public Landing Page Header */}
      <LandingHeader
        theme={theme}
        setTheme={setTheme}
        isAuthenticated={isAuthenticated}
        onOpenStudio={onOpenStudio}
        onSignOut={onSignOut}
        onSignIn={onOpenSignIn}
        onSignUp={onOpenSignUp}
        onOpenAdmin={onOpenAdmin}
      />

      {/* Main Landing Page Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center">
        {/* HERO SECTION */}
        <section className="w-full max-w-7xl mx-auto flex flex-col items-center text-center gap-6 pt-12 pb-10 px-4 sm:px-6 lg:px-8">
          {/* Announcement Pill */}
          <ScrollReveal delay={0}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border border-[#FF8800]/30 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#2ECC71] animate-ping" />
              <span className="text-brand-gradient font-bold">The all-in-one platform</span>
              <span className="text-[#6B6B75]">•</span>
              <span>That empowers Digital Creativity</span>
            </div>
          </ScrollReveal>

          {/* Main Headline */}
          <ScrollReveal delay={0.1}>
            <h1 className="jost text-4xl sm:text-6xl lg:text-7xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight leading-[1.08] max-w-5xl">
              The African AI Creative Studio for{' '}
              <span className="text-brand-gradient">Visuals, Cinema & Sound</span>
            </h1>
          </ScrollReveal>

          {/* Subtitle */}
          <ScrollReveal delay={0.2}>
            <p className="inter text-base sm:text-lg text-[#6B6B75] dark:text-[#A0A0AA] max-w-2xl leading-relaxed">
              Synthesize high-fidelity images with Google Nano Banana, direct cinematic scenes with Google Veo 3.1, and arrange authentic African music with Lyria 3 Pro. Powered by local Mobile Money in FCFA.
            </p>
          </ScrollReveal>

          {/* CTAs */}
          <ScrollReveal delay={0.3}>
            <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
              <button
                type="button"
                onClick={onOpenSignUp}
                id="hero-create-free-btn"
                className="flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold text-white bg-brand-gradient shadow-xl shadow-[#F86A00]/25 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles size={18} />
                <span>Create Free — 500 Free Welcome Credits for Fast Image Models</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={handleScrollToPricing}
                id="hero-view-pricing-btn"
                className="flex items-center gap-2 px-7 py-4 rounded-2xl text-sm font-semibold glass-panel text-[#1A1A1E] dark:text-[#F5F5F7] hover:border-[#FF8800] transition-colors cursor-pointer"
              >
                <span>View Pricing in FCFA</span>
              </button>
            </div>

            {/* Live Active Community Social Proof Badge */}
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] mt-2">
              <div className="flex -space-x-1.5 overflow-hidden">
                <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-[#121214] bg-[#FF8800] text-[10px] text-white font-bold flex items-center justify-center">
                  YD
                </span>
                <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-[#121214] bg-[#F86A00] text-[10px] text-white font-bold flex items-center justify-center">
                  KN
                </span>
                <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-[#121214] bg-[#2ECC71] text-[10px] text-white font-bold flex items-center justify-center">
                  AB
                </span>
              </div>
              <span>
                Joined by{' '}
                <strong className="text-[#1A1A1E] dark:text-[#F5F5F7]">
                  <CountUpStat value={platformStats.totalUsers} />+
                </strong>{' '}
                active African creators & studios
              </span>
            </div>
          </ScrollReveal>
        </section>

        {/* THREE STUDIO FEATURE PILLARS */}
        <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="features-pillars">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            {/* Image Pillar */}
            <ScrollReveal delay={0} className="h-full">
              <div className="p-7 h-full rounded-3xl glass-panel border border-[#FF8800]/25 flex flex-col gap-3.5 hover:border-[#FF8800] transition-all">
                <IconTile icon={<ImageIcon size={24} />} tone="primary" size="lg" />
                <h3 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Google Nano Banana
                </h3>
                <p className="inter text-xs sm:text-sm text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                  Ultra-detailed 8K visuals with volumetric atmospheric lighting, square, portrait, and cinematic landscape aspect ratios with server prompt enhancement.
                </p>
                <div className="pt-2 mt-auto flex items-center justify-between border-t border-[#FF8800]/15">
                  <span className="text-xs font-mono font-bold text-brand-gradient">
                    From 10 credits for images
                  </span>
                  <span className="text-[11px] font-semibold text-[#6B6B75]">8K Export</span>
                </div>
              </div>
            </ScrollReveal>

            {/* Video Pillar */}
            <ScrollReveal delay={0.1} className="h-full">
              <div className="p-7 h-full rounded-3xl glass-panel border border-[#FF8800]/25 flex flex-col gap-3.5 hover:border-[#FF8800] transition-all">
                <IconTile icon={<VideoIcon size={24} />} tone="primary" size="lg" />
                <h3 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Google Veo 3.1 Cinema
                </h3>
                <p className="inter text-xs sm:text-sm text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                  Direct single-shot cinematic scenes up to 8 seconds in 720p or 1080p with organic camera tracking, realistic physical lighting, and motion fidelity.
                </p>
                <div className="pt-2 mt-auto flex items-center justify-between border-t border-[#FF8800]/15">
                  <span className="text-xs font-mono font-bold text-brand-gradient">
                    From 310 credits for video
                  </span>
                  <span className="text-[11px] font-semibold text-[#6B6B75]">60fps Motion</span>
                </div>
              </div>
            </ScrollReveal>

            {/* Music Pillar */}
            <ScrollReveal delay={0.2} className="h-full">
              <div className="p-7 h-full rounded-3xl glass-panel border border-[#FF8800]/25 flex flex-col gap-3.5 hover:border-[#FF8800] transition-all">
                <IconTile icon={<MusicIcon size={24} />} tone="amber" size="lg" />
                <h3 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Lyria 3 Pro African Music
                </h3>
                <p className="inter text-xs sm:text-sm text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                  Authentic Makossa, Bikutsi, Amapiano, Afrobeats, and Mbolé rhythms. Every session outputs 2 full studio takes with integrated AI lyricist and cover art.
                </p>
                <div className="pt-2 mt-auto flex items-center justify-between border-t border-[#FF8800]/15">
                  <span className="text-xs font-mono font-bold text-brand-gradient">
                    From 150 credits (2 Takes)
                  </span>
                  <span className="text-[11px] font-semibold text-[#6B6B75]">Stereo Master</span>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* 2.4 THREE SEPARATE AUTO-SCROLLING SHOWCASE CAROUSELS */}
        <section className="w-full flex flex-col gap-8 py-10" id="showcase-section">
          {/* 1. Video Carousel */}
          <ScrollReveal delay={0}>
            <ShowcaseCarousel
              mediaType="video"
              title="Generated with Bidou — Video"
              subtitle="Explore high-definition motion directed in Google Veo 3.1"
              items={videoShowcaseItems}
              onCardClick={() => onOpenSignUp()}
            />
          </ScrollReveal>

          {/* 2. Image Carousel */}
          <ScrollReveal delay={0.1}>
            <ShowcaseCarousel
              mediaType="image"
              title="Generated with Bidou — Image"
              subtitle="Ultra-sharp 8K Afrofuturism and portraits synthesized with Google Nano Banana"
              items={imageShowcaseItems}
              onCardClick={() => onOpenSignUp()}
            />
          </ScrollReveal>

          {/* 3. Music Carousel */}
          <ScrollReveal delay={0.1}>
            <ShowcaseCarousel
              mediaType="music"
              title="Generated with Bidou — Music"
              subtitle="Listen to authentic Makossa, Bikutsi, and Amapiano arrangements composed with Lyria 3 Pro"
              items={musicShowcaseItems}
              onCardClick={() => onOpenSignUp()}
            />
          </ScrollReveal>
        </section>

        {/* TRUST SECTION: BUILT FOR AFRICA */}
        <ScrollReveal className="w-full">
          <BuiltForAfricaSection onGetStarted={onOpenSignUp} />
        </ScrollReveal>

        {/* 3. DYNAMIC ACTIVE CREATORS & PLATFORM STATS PROOF SECTION */}
        <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="growth-stats-section">
          <ScrollReveal className="w-full">
            <div className="p-8 sm:p-10 rounded-3xl glass-panel border border-[#FF8800]/25 bg-gradient-to-r from-[#F86A00]/10 via-[#FF8800]/5 to-[#2ECC71]/10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex flex-col gap-2 max-w-xl text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel border border-[#FF8800]/30 text-xs font-bold text-brand-gradient self-center md:self-start">
                  <span className="w-2 h-2 rounded-full bg-[#2ECC71] animate-pulse" />
                  <span>Realtime Community Growth</span>
                </div>
                <h3 className="jost text-2xl sm:text-3xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight">
                  Powering Africa's Next Wave of Creative Entrepreneurs
                </h3>
                <p className="inter text-xs sm:text-sm text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                  From commercial directors in Douala to beatmakers in Yaoundé and graphic artists across CEMAC, creators rely on Bidou AI daily for professional production.
                </p>
              </div>

              {/* Counter Badges Grid */}
              <div className="grid grid-cols-2 gap-4 w-full md:w-auto shrink-0">
                {/* Active Users */}
                <div className="p-5 sm:p-6 rounded-2xl glass-panel border border-black/5 dark:border-white/5 flex flex-col items-center md:items-start gap-2 bg-white/40 dark:bg-white/5">
                  <div className="flex items-center gap-2 text-[#FF8800]">
                    <Users size={20} />
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA]">
                      Active Members
                    </span>
                  </div>
                  <div className="jost text-3xl sm:text-4xl font-black text-brand-gradient">
                    <CountUpStat value={platformStats.totalUsers} />+
                  </div>
                  <span className="text-[11px] font-medium text-[#6B6B75] dark:text-[#A0A0AA]">
                    Registered African Creators
                  </span>
                </div>

                {/* Paid Subscribers */}
                <div className="p-5 sm:p-6 rounded-2xl glass-panel border border-black/5 dark:border-white/5 flex flex-col items-center md:items-start gap-2 bg-white/40 dark:bg-white/5">
                  <div className="flex items-center gap-2 text-[#2ECC71]">
                    <UserCheck size={20} />
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA]">
                      Subscribed Tiers
                    </span>
                  </div>
                  <div className="jost text-3xl sm:text-4xl font-black text-[#2ECC71]">
                    <CountUpStat value={platformStats.paidUsers} />+
                  </div>
                  <span className="text-[11px] font-medium text-[#6B6B75] dark:text-[#A0A0AA]">
                    Pro & Studio Members
                  </span>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* PRICING PREVIEW */}
        <ScrollReveal className="w-full">
          <LandingPricingPreview
            onOpenSignUp={onOpenSignUp}
            isAuthenticated={isAuthenticated}
            onCompletePayment={onCompletePayment}
          />
        </ScrollReveal>

        {/* FAQ ACCORDION SECTION */}
        <section className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12" id="faq-section">
          <ScrollReveal delay={0}>
            <div className="flex flex-col items-center text-center gap-3 mb-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full glass-panel border border-[#FF8800]/30 text-xs font-bold text-brand-gradient">
                <HelpCircle size={14} />
                <span>Frequently Asked Questions</span>
              </div>
              <h2 className="jost text-3xl sm:text-4xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight">
                Everything You Need to Know
              </h2>
              <p className="inter text-sm text-[#6B6B75] dark:text-[#A0A0AA]">
                Have questions about payments, models, or studio access? We've got you covered.
              </p>
            </div>
          </ScrollReveal>

          <div className="flex flex-col gap-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <ScrollReveal key={index} delay={index * 0.05} className="w-full">
                  <div
                    className="rounded-2xl glass-panel border border-[#FF8800]/20 overflow-hidden transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                      className="w-full px-5 py-4 flex items-center justify-between text-left text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7] hover:text-[#F86A00] transition-colors cursor-pointer"
                    >
                      <span>{faq.question}</span>
                      {isOpen ? (
                        <ChevronUp size={18} className="text-[#FF8800] shrink-0 ml-4" />
                      ) : (
                        <ChevronDown size={18} className="text-[#6B6B75] shrink-0 ml-4" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 text-xs sm:text-sm text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed border-t border-[#FF8800]/10 pt-3">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </section>

        {/* FINAL CONVERSION CTA */}
        <ScrollReveal className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="relative rounded-3xl p-8 sm:p-12 glass-panel border-2 border-[#FF8800]/30 bg-gradient-to-r from-[#F86A00]/15 via-[#FF8800]/10 to-[#FFB020]/15 text-center flex flex-col items-center gap-6 overflow-hidden">
            <h2 className="jost text-3xl sm:text-5xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight max-w-2xl">
              Ready to create something unforgettable?
            </h2>
            <p className="inter text-sm sm:text-base text-[#6B6B75] dark:text-[#A0A0AA] max-w-xl">
              Join thousands of African digital artists, filmmakers, musicians, and studios. Sign up now and receive 500 free welcome credits for fast image models automatically.
            </p>
            <button
              type="button"
              onClick={onOpenSignUp}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold text-white bg-brand-gradient shadow-xl shadow-[#F86A00]/30 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles size={18} />
              <span>Get Started Free</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </ScrollReveal>
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 w-full border-t border-[#FF8800]/15 bg-white/50 dark:bg-[#0A0A0C]/50 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <BidouLogo
              variant={theme === 'dark' ? 'dark' : 'light'}
              size={36}
            />
            <div className="text-left">
              <span className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7] block">
                Bidou AI Creative Studio
              </span>
              <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
                Douala • Yaoundé • Central & West Africa
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <button
              type="button"
              onClick={onOpenSignIn}
              className="px-4 py-2 rounded-xl glass-panel text-[#1A1A1E] dark:text-[#F5F5F7] hover:border-[#FF8800]"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={onOpenSignUp}
              className="px-4 py-2 rounded-xl text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20"
            >
              Get Started Free
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-6 pt-6 border-t border-[#FF8800]/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
          <span>© 2026 Bidou AI. All rights reserved. Built for African creators.</span>
          <div className="flex items-center gap-6">
            <a href="#trust-section" className="hover:text-[#F86A00]">
              Mobile Money
            </a>
            <a href="#pricing-preview" className="hover:text-[#F86A00]">
              Pricing
            </a>
            <a href="#faq-section" className="hover:text-[#F86A00]">
              FAQ
            </a>
            {onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="hover:text-[#F86A00] transition-colors cursor-pointer text-left"
              >
                Admin Gate
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
