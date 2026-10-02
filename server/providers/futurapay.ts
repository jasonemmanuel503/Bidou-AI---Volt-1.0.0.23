// Bidou AI - FuturaPay REST API Provider
// Implements direct REST payment flow for MTN Mobile Money & Orange Money Cameroon

export interface FuturaPayConfig {
  apiBase: string;
  merchantKey: string;
  siteId: string;
  apiKey: string;
}

export interface InitiateDepositParams {
  token: string;
  amount: number;
  currency?: string;
  reference: string;
  customerPhone?: string;
  customerEmail?: string;
  returnUrl?: string;
  callbackUrl?: string;
}

export interface SelectGatewayParams {
  token: string;
  reference: string;
  channel: string;
}

export interface UpdateStatusParams {
  token: string;
  reference: string;
  status: string;
}

export interface ProcessPaymentParams {
  token: string;
  reference: string;
  phoneNumber: string;
}

export interface FuturaPayStatusResult {
  reference: string;
  status: 'SUCCESS' | 'COMPLETED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'PENDING';
  transactionId?: string;
  amount?: number;
  currency?: string;
  raw?: any;
}

export interface DirectPaymentFlowInput {
  referenceId: string;
  amount: number;
  channel: string;
  phoneNumber: string;
  customerEmail?: string;
  returnUrl?: string;
  callbackUrl?: string;
}

/**
 * Resolves FuturaPay configuration from environment.
 */
export function getFuturaPayConfig(): FuturaPayConfig {
  const rawBase = process.env.FUTURAPAY_API_BASE || process.env.FUTURAPAY_API_URL || 'https://api.futurapay.com';
  const apiBase = rawBase.replace(/\/+$/, '');
  const merchantKey = process.env.FUTURAPAY_MERCHANT_KEY || process.env.FUTURAPAY_MERCHANT_ID || '';
  const siteId = process.env.FUTURAPAY_SITE_ID || process.env.FUTURAPAY_MERCHANT_ID || '';
  const apiKey = process.env.FUTURAPAY_API_KEY || '';

  return { apiBase, merchantKey, siteId, apiKey };
}

/**
 * 1. Generate merchant authorization token for direct REST operations.
 * Calls POST /merchant/token/generate
 */
export async function getMerchantToken(): Promise<string> {
  const { apiBase, merchantKey, siteId, apiKey } = getFuturaPayConfig();
  const endpoint = `${apiBase}/merchant/token/generate`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      merchant_key: merchantKey,
      site_id: siteId,
      api_key: apiKey,
    }),
    signal: AbortSignal.timeout(15000),
  });

  console.log(`[FuturaPay] POST /merchant/token/generate -> status: ${res.status}`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.warn(`[FuturaPay] Token generation failed with HTTP ${res.status}`);
    throw new Error(`FUTURAPAY_TOKEN_FAILED: ${res.status} ${errorText.slice(0, 100)}`);
  }

  const data: any = await res.json();
  const token = data?.token || data?.data?.token || data?.access_token || data?.data?.access_token;
  if (!token || typeof token !== 'string') {
    throw new Error('FUTURAPAY_TOKEN_MISSING: Token response did not contain access token');
  }

  return token;
}

/**
 * 2. Initiate deposit transaction.
 * Calls POST /payments/initiate
 */
export async function initiateDeposit(params: InitiateDepositParams): Promise<any> {
  const { apiBase, siteId } = getFuturaPayConfig();
  const endpoint = `${apiBase}/payments/initiate`;

  const payload: Record<string, any> = {
    site_id: siteId,
    amount: params.amount,
    currency: params.currency || 'XAF',
    reference: params.reference,
  };

  if (params.customerPhone) payload.customer_phone = params.customerPhone;
  if (params.customerEmail) payload.customer_email = params.customerEmail;
  if (params.returnUrl) payload.return_url = params.returnUrl;
  if (params.callbackUrl) payload.callback_url = params.callbackUrl;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${params.token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  console.log(`[FuturaPay] POST /payments/initiate -> status: ${res.status}`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.warn(`[FuturaPay] Payment initiate failed with HTTP ${res.status}`);
    throw new Error(`FUTURAPAY_INITIATE_FAILED: ${res.status} ${errorText.slice(0, 100)}`);
  }

  return await res.json();
}

/**
 * 3. Select Payment Gateway / Rail (MTN MoMo or Orange Money).
 * Calls POST /payments/status/update
 */
export async function selectGateway(params: SelectGatewayParams): Promise<any> {
  const { apiBase } = getFuturaPayConfig();
  const endpoint = `${apiBase}/payments/status/update`;

  // Map channel to provider gateway identifiers
  const gatewayMapping: Record<string, string> = {
    mtn_momo: 'MTN_MOMO',
    orange_money: 'ORANGE_MONEY',
  };
  const gateway = gatewayMapping[params.channel] || params.channel;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      reference: params.reference,
      gateway,
      channel: params.channel,
      status: 'GATEWAY_SELECTED',
    }),
    signal: AbortSignal.timeout(15000),
  });

  console.log(`[FuturaPay] POST /payments/status/update (selectGateway) -> status: ${res.status}`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.warn(`[FuturaPay] Select gateway failed with HTTP ${res.status}`);
    throw new Error(`FUTURAPAY_SELECT_GATEWAY_FAILED: ${res.status} ${errorText.slice(0, 100)}`);
  }

  return await res.json();
}

/**
 * 4. Update Payment Status to ready state.
 * Calls POST /payments/status/update
 */
export async function updatePaymentStatus(params: UpdateStatusParams): Promise<any> {
  const { apiBase } = getFuturaPayConfig();
  const endpoint = `${apiBase}/payments/status/update`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      reference: params.reference,
      status: params.status,
    }),
    signal: AbortSignal.timeout(15000),
  });

  console.log(`[FuturaPay] POST /payments/status/update -> status: ${res.status}`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.warn(`[FuturaPay] Payment status update failed with HTTP ${res.status}`);
    throw new Error(`FUTURAPAY_STATUS_UPDATE_FAILED: ${res.status} ${errorText.slice(0, 100)}`);
  }

  return await res.json();
}

/**
 * 5. Process Payment and trigger USSD prompt on user's mobile device.
 * Calls POST /payments/processed
 */
export async function processPayment(params: ProcessPaymentParams): Promise<any> {
  const { apiBase } = getFuturaPayConfig();
  const endpoint = `${apiBase}/payments/processed`;

  const cleanPhone = params.phoneNumber.replace(/[^\d+]/g, '');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      reference: params.reference,
      phone_number: cleanPhone,
      phone: cleanPhone,
    }),
    signal: AbortSignal.timeout(15000),
  });

  console.log(`[FuturaPay] POST /payments/processed -> status: ${res.status}`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.warn(`[FuturaPay] Process payment failed with HTTP ${res.status}`);
    throw new Error(`FUTURAPAY_PROCESS_PAYMENT_FAILED: ${res.status} ${errorText.slice(0, 100)}`);
  }

  return await res.json();
}

/**
 * 6. Authoritative status lookup from FuturaPay.
 * Queries status check endpoint to confirm if transaction succeeded.
 */
export async function checkFuturaPayStatus(reference: string): Promise<FuturaPayStatusResult> {
  const { apiBase, apiKey } = getFuturaPayConfig();
  const endpoint = `${apiBase}/payments/status/${encodeURIComponent(reference)}`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });

  console.log(`[FuturaPay] GET /payments/status/:ref -> status: ${res.status}`);

  if (!res.ok) {
    // If 404 or pending not found yet, treat as PENDING
    if (res.status === 404) {
      return { reference, status: 'PENDING' };
    }
    const errorText = await res.text().catch(() => '');
    console.warn(`[FuturaPay] Status check returned HTTP ${res.status}`);
    throw new Error(`FUTURAPAY_STATUS_CHECK_FAILED: ${res.status} ${errorText.slice(0, 100)}`);
  }

  const data: any = await res.json();
  const rawStatus = (
    data?.status ||
    data?.payment_status ||
    data?.data?.status ||
    data?.transaction_status ||
    ''
  ).toUpperCase();

  let normalizedStatus: FuturaPayStatusResult['status'] = 'PENDING';
  if (['SUCCESS', 'COMPLETED', 'PAID', 'SETTLED', 'SUCCESSFUL'].includes(rawStatus)) {
    normalizedStatus = 'SUCCESS';
  } else if (['FAILED', 'CANCELLED', 'DECLINED', 'REJECTED', 'EXPIRED'].includes(rawStatus)) {
    normalizedStatus = 'FAILED';
  }

  const transactionId =
    data?.transaction_id ||
    data?.provider_tx_id ||
    data?.tx_id ||
    data?.data?.transaction_id ||
    data?.id;

  return {
    reference,
    status: normalizedStatus,
    transactionId: transactionId ? String(transactionId) : undefined,
    amount: data?.amount || data?.data?.amount,
    currency: data?.currency || data?.data?.currency,
    raw: data,
  };
}

/**
 * High-level orchestration for direct REST mobile money flow.
 * Steps: Token -> Initiate -> Select Gateway -> Update Status -> Process (USSD Push)
 */
export async function executeDirectPaymentFlow(input: DirectPaymentFlowInput): Promise<{ success: boolean; referenceId: string }> {
  const { referenceId, amount, channel, phoneNumber, customerEmail, returnUrl, callbackUrl } = input;

  // Step 1: Generate merchant token
  const token = await getMerchantToken();

  // Step 2: Initiate deposit
  await initiateDeposit({
    token,
    amount,
    currency: 'XAF',
    reference: referenceId,
    customerPhone: phoneNumber,
    customerEmail,
    returnUrl,
    callbackUrl,
  });

  // Step 3: Select payment gateway (MTN MoMo or Orange Money)
  await selectGateway({
    token,
    reference: referenceId,
    channel,
  });

  // Step 4: Update status to pending/processing
  await updatePaymentStatus({
    token,
    reference: referenceId,
    status: 'INITIATED',
  });

  // Step 5: Process payment (triggers USSD push to user's phone)
  await processPayment({
    token,
    reference: referenceId,
    phoneNumber,
  });

  return {
    success: true,
    referenceId,
  };
}
