import { PlanTier } from '../types';
export * from '../services/tiers';

export interface TierConfig {
  id: PlanTier;
  name: string;
  priceXaf: number;
  rolloverCredits: number;
  speed: 'standard' | 'priority' | 'highest';
  description: string;
}

export const TIER_CONFIGS: Record<PlanTier, TierConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    priceXaf: 0,
    rolloverCredits: 0,
    speed: 'standard',
    description: '0 XAF / month, 0 rollover credits, standard generation speeds.',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceXaf: 2000,
    rolloverCredits: 1500,
    speed: 'standard',
    description: '2,000 XAF / pack, 1,500 universal credits, standard generation speeds.',
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    priceXaf: 5400,
    rolloverCredits: 5500,
    speed: 'priority',
    description: '5,400 XAF / pack, 5,500 universal credits, priority generation queue.',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceXaf: 16000,
    rolloverCredits: 18000,
    speed: 'priority',
    description: '16,000 XAF / pack, 18,000 universal credits, priority GPU queue.',
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    priceXaf: 42000,
    rolloverCredits: 53000,
    speed: 'highest',
    description: '42,000 XAF / pack, 53,000 universal credits, highest GPU priority.',
  },
};
