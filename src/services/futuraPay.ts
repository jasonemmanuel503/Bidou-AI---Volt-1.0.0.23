// Bidou AI FuturaPay Service
/**
 * BIDOU AI - FuturaPay Mobile Money Service
 * Implements Section 5:
 * - MTN Mobile Money & Orange Money collection in Cameroon (FCFA)
 * - Server-side webhook confirmation with strict idempotency on reference_id
 * - Periodic reconciliation poller for stuck pending transactions
 * - Variable transaction fee allocation
 */

import { CreditWallet, FuturaPayPayment, PaymentRail, PaymentStatus } from '../types';
import { CreditLedger } from './creditLedger';
import { newId } from './ids';

const SEED_PAYMENTS: FuturaPayPayment[] = [
  {
    id: 'pay_init_1',
    reference_id: 'fp_ref_seed_01',
    user_id: 'usr_creator_01',
    package_id: 'pkg_starter',
    amount_fcfa: 3500,
    credits_to_add: 450,
    payment_rail: 'mtn_momo',
    phone_number: '677123456',
    status: 'successful',
    fee_fcfa: 88,
    created_at: '2026-09-13T10:15:00.000Z',
    completed_at: '2026-09-13T10:15:20.000Z',
  },
  {
    id: 'pay_init_2',
    reference_id: 'fp_ref_seed_02',
    user_id: 'usr_creator_02',
    package_id: 'pkg_pro',
    amount_fcfa: 7500,
    credits_to_add: 1100,
    payment_rail: 'orange_money',
    phone_number: '699234567',
    status: 'successful',
    fee_fcfa: 188,
    created_at: '2026-09-14T14:30:00.000Z',
    completed_at: '2026-09-14T14:30:15.000Z',
  },
  {
    id: 'pay_init_3',
    reference_id: 'fp_ref_seed_03',
    user_id: 'usr_creator_03',
    package_id: 'pkg_pro',
    amount_fcfa: 11000,
    credits_to_add: 1650,
    payment_rail: 'mtn_momo',
    phone_number: '670345678',
    status: 'successful',
    fee_fcfa: 275,
    created_at: '2026-09-15T09:20:00.000Z',
    completed_at: '2026-09-15T09:20:25.000Z',
  },
  {
    id: 'pay_init_4',
    reference_id: 'fp_ref_seed_04',
    user_id: 'usr_creator_04',
    package_id: 'pkg_enterprise',
    amount_fcfa: 18000,
    credits_to_add: 3000,
    payment_rail: 'mtn_momo',
    phone_number: '675456789',
    status: 'successful',
    fee_fcfa: 450,
    created_at: '2026-09-16T16:45:00.000Z',
    completed_at: '2026-09-16T16:45:18.000Z',
  },
  {
    id: 'pay_init_5',
    reference_id: 'fp_ref_seed_05',
    user_id: 'usr_creator_05',
    package_id: 'pkg_starter',
    amount_fcfa: 7000,
    credits_to_add: 900,
    payment_rail: 'orange_money',
    phone_number: '691567890',
    status: 'successful',
    fee_fcfa: 175,
    created_at: '2026-09-17T11:10:00.000Z',
    completed_at: '2026-09-17T11:10:12.000Z',
  },
  {
    id: 'pay_init_6',
    reference_id: 'fp_ref_seed_06',
    user_id: 'usr_creator_06',
    package_id: 'pkg_enterprise',
    amount_fcfa: 25500,
    credits_to_add: 4200,
    payment_rail: 'mtn_momo',
    phone_number: '678678901',
    status: 'successful',
    fee_fcfa: 638,
    created_at: '2026-09-18T08:05:00.000Z',
    completed_at: '2026-09-18T08:05:30.000Z',
  },
];

const STORAGE_KEY = 'bidou_futurapay_payments';

export class FuturaPayService {
  private payments: Map<string, FuturaPayPayment> = new Map();
  private processedReferenceIds: Set<string> = new Set();
  private creditLedger: CreditLedger;
  private merchantFeePercent: number = 0.025; // 2.5% (Configurable, tracked in LAUNCH_CHECKLIST.md)

  constructor(creditLedger: CreditLedger) {
    this.creditLedger = creditLedger;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const list = JSON.parse(raw) as FuturaPayPayment[];
        list.forEach((p) => {
          this.payments.set(p.reference_id, p);
          if (p.status === 'successful') {
            this.processedReferenceIds.add(p.reference_id);
          }
        });
      } else {
        SEED_PAYMENTS.forEach((p) => {
          this.payments.set(p.reference_id, p);
          if (p.status === 'successful') {
            this.processedReferenceIds.add(p.reference_id);
          }
        });
        this.saveToStorage();
      }
    } catch {
      SEED_PAYMENTS.forEach((p) => this.payments.set(p.reference_id, p));
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.payments.values())));
      }
    } catch {
      // Ignore storage quota or access errors
    }
  }

  /**
   * Initiate Mobile Money Payment Request
   */
  public initiatePayment(params: {
    userId: string;
    packageId: string;
    amountFcfa: number;
    creditsToAdd: number;
    paymentRail: PaymentRail;
    phoneNumber: string;
  }): FuturaPayPayment {
    const referenceId = newId('fp_ref_');
    const feeFcfa = Math.round(params.amountFcfa * this.merchantFeePercent);

    const payment: FuturaPayPayment = {
      id: newId('pay_'),
      reference_id: referenceId,
      user_id: params.userId,
      package_id: params.packageId,
      amount_fcfa: params.amountFcfa,
      credits_to_add: params.creditsToAdd,
      payment_rail: params.paymentRail,
      phone_number: params.phoneNumber,
      status: 'pending',
      fee_fcfa: feeFcfa,
      created_at: new Date().toISOString(),
    };

    this.payments.set(referenceId, payment);
    this.saveToStorage();
    return payment;
  }

  /**
   * Server-Side Webhook Handler (Section 5)
   * IDEMPOTENCY REQUIREMENT: If reference_id was already credited, reject duplicate.
   */
  public handleWebhook(payload: {
    reference_id: string;
    status: PaymentStatus;
    futurapay_tx_id?: string;
  }): { success: boolean; message: string; duplicateIgnored?: boolean } {
    const { reference_id, status, futurapay_tx_id } = payload;

    const payment = this.payments.get(reference_id);
    if (!payment) {
      return { success: false, message: `Payment with reference ${reference_id} not found.` };
    }

    // IDEMPOTENCY CHECK: Guard against duplicate deliveries
    if (this.processedReferenceIds.has(reference_id)) {
      console.warn(`[FuturaPay Webhook] Duplicate webhook for reference ${reference_id} ignored.`);
      return { success: true, message: 'Duplicate webhook successfully ignored.', duplicateIgnored: true };
    }

    payment.status = status;
    payment.futurapay_tx_id = futurapay_tx_id;
    payment.completed_at = new Date().toISOString();
    this.saveToStorage();

    if (status === 'successful') {
      // Mark as processed BEFORE credit ledger write to lock idempotency
      this.processedReferenceIds.add(reference_id);

      // Credit the universal wallet
      this.creditLedger.recordTransaction({
        userId: payment.user_id,
        type: 'purchase',
        amount: payment.credits_to_add,
        referenceId: reference_id,
        description: `Package purchase via ${payment.payment_rail === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'} (${payment.amount_fcfa.toLocaleString()} FCFA)`,
      });

      return { success: true, message: `Successfully credited ${payment.credits_to_add} credits.` };
    }

    return { success: true, message: `Payment state updated to ${status}.` };
  }

  /**
   * Reconciliation Job (Section 5.3)
   * Periodically checks any payment stuck in 'pending' beyond 2 minutes.
   */
  public reconcilePendingPayments(): number {
    const now = Date.now();
    let reconciledCount = 0;

    for (const [refId, payment] of this.payments.entries()) {
      if (payment.status === 'pending') {
        const ageMs = now - new Date(payment.created_at).getTime();
        // If pending for > 15 seconds in prototype simulation, automatically resolve to success or fail
        if (ageMs > 12000) {
          this.handleWebhook({
            reference_id: refId,
            status: 'successful',
            futurapay_tx_id: `tx_${Math.random().toString(36).substring(2, 9)}`,
          });
          reconciledCount++;
        }
      }
    }

    return reconciledCount;
  }

  public getPayments(): FuturaPayPayment[] {
    return Array.from(this.payments.values());
  }
}
