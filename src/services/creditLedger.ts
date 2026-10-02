// Bidou AI Credit Ledger
/**
 * BIDOU AI - Credit Ledger & Reservation System
 * Implements Section 6.2 & 6.3:
 * - Single universal credit wallet per user
 * - Immutable transaction ledger with balance_after written at write-time
 * - Two-phase reservation -> consume or refund pattern
 * - Automatic timeout integrity resolution
 */

import { CreditTransaction, CreditWallet, TransactionType } from '../types';
import { FREE_TIER_WELCOME_CREDITS } from './configData';
import { newId } from './ids';

export class CreditLedger {
  private wallets: Map<string, CreditWallet> = new Map();
  private transactions: CreditTransaction[] = [];
  private activeReservations: Map<string, { userId: string; amount: number; expiresAt: number }> = new Map();

  constructor(initialWallets: CreditWallet[] = [], initialTransactions: CreditTransaction[] = []) {
    initialWallets.forEach((w) => this.wallets.set(w.user_id, { ...w }));
    this.transactions = [...initialTransactions];
  }

  /**
   * Fetch current wallet balance
   */
  public getWallet(userId: string): CreditWallet {
    let wallet = this.wallets.get(userId);
    if (!wallet) {
      wallet = {
        id: `wal_${userId}`,
        user_id: userId,
        balance: FREE_TIER_WELCOME_CREDITS, // Free tier initial welcome credits
        updated_at: new Date().toISOString(),
      };
      this.wallets.set(userId, wallet);
      
      // Seed welcome bonus transaction
      this.recordTransaction({
        userId,
        type: 'bonus',
        amount: FREE_TIER_WELCOME_CREDITS,
        referenceId: `bonus_${userId}`,
        description: 'Welcome creative credit grant (Free Tier)',
      });
    }
    return wallet;
  }

  /**
   * Internal immutable transaction writer.
   * Calculates and saves balance_after atomically.
   */
  public recordTransaction(params: {
    userId: string;
    type: TransactionType;
    amount: number;
    referenceId: string;
    description: string;
  }): CreditTransaction {
    let wallet = this.wallets.get(params.userId);
    if (!wallet) {
      wallet = {
        id: `wal_${params.userId}`,
        user_id: params.userId,
        balance: 0,
        updated_at: new Date().toISOString(),
      };
      this.wallets.set(params.userId, wallet);
    }

    const newBalance = wallet.balance + params.amount;
    wallet.balance = newBalance;
    wallet.updated_at = new Date().toISOString();

    const tx: CreditTransaction = {
      id: newId('tx_'),
      user_id: params.userId,
      type: params.type,
      amount: params.amount,
      balance_after: newBalance, // Written at write time for tamper-proof audit
      reference_id: params.referenceId,
      description: params.description,
      created_at: new Date().toISOString(),
    };

    this.transactions.push(tx);
    return tx;
  }

  /**
   * Step 1: Reserve Credits before provider API call fires (Section 6.3)
   * Throws immediately if balance is insufficient (triggers "Out of Credits" modal).
   */
  public reserveCredits(userId: string, amount: number, jobId: string, timeoutSeconds: number = 180): string {
    const wallet = this.getWallet(userId);
    if (wallet.balance < amount) {
      throw new Error(`INSUFFICIENT_CREDITS: Required ${amount}, available ${wallet.balance}`);
    }

    const reservationId = newId('res_');
    
    // Deduct available balance and record reservation transaction
    this.recordTransaction({
      userId,
      type: 'generation_reservation',
      amount: -amount,
      referenceId: jobId,
      description: `Hold for generation job #${jobId.substring(0, 8)}`,
    });

    this.activeReservations.set(reservationId, {
      userId,
      amount,
      expiresAt: Date.now() + timeoutSeconds * 1000,
    });

    return reservationId;
  }

  /**
   * Step 2A: Finalize consumption upon successful provider completion
   */
  public consumeReservation(reservationId: string, jobId: string, description?: string): void {
    const res = this.activeReservations.get(reservationId);
    if (!res) {
      console.warn(`Reservation ${reservationId} already resolved or expired.`);
      return;
    }

    // Reservation was already deducted from balance; log formal consumption record
    this.recordTransaction({
      userId: res.userId,
      type: 'generation_consumed',
      amount: 0, // Balance already deducted at reservation
      referenceId: jobId,
      description: description || `Generation completed successfully for #${jobId.substring(0, 8)}`,
    });

    this.activeReservations.delete(reservationId);
  }

  /**
   * Step 2B: Refund reservation upon failed generation or early cancellation
   */
  public refundReservation(reservationId: string, jobId: string, reason: string): void {
    const res = this.activeReservations.get(reservationId);
    if (!res) {
      console.warn(`Reservation ${reservationId} not found to refund.`);
      return;
    }

    // Re-credit wallet with the held amount
    this.recordTransaction({
      userId: res.userId,
      type: 'generation_refund',
      amount: res.amount,
      referenceId: jobId,
      description: `Auto-refund for job #${jobId.substring(0, 8)}: ${reason}`,
    });

    this.activeReservations.delete(reservationId);
  }

  /**
   * Cancellation Handler (Section 6.3)
   * - Before provider call starts -> full refund
   * - After billable work started -> credits consumed
   */
  public cancelJob(reservationId: string, jobId: string, providerStarted: boolean): { refunded: boolean } {
    if (!providerStarted) {
      this.refundReservation(reservationId, jobId, 'Cancelled prior to provider dispatch');
      return { refunded: true };
    } else {
      this.consumeReservation(reservationId, jobId, 'Cancelled after provider started billable inference');
      return { refunded: false };
    }
  }

  /**
   * Scheduled Integrity Check: Detect and auto-resolve orphaned reservations past timeout
   */
  public sweepTimedOutReservations(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [resId, data] of this.activeReservations.entries()) {
      if (now > data.expiresAt) {
        this.refundReservation(resId, resId.replace('res_', ''), 'Reservation timeout exceeded');
        cleaned++;
      }
    }
    return cleaned;
  }

  public getTransactions(userId?: string): CreditTransaction[] {
    if (userId) {
      return this.transactions.filter((t) => t.user_id === userId);
    }
    return [...this.transactions];
  }

  public getAllWallets(): CreditWallet[] {
    return Array.from(this.wallets.values());
  }
}
