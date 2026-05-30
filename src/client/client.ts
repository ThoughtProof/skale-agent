// ThoughtProof x402 Client for SKALE
// Handles discovery, payment, and verification in one clean interface

import type {
  ThoughtProofClientConfig,
  SentinelRequest,
  SentinelResponse,
  VerifyRequest,
  VerifyResponse,
  StatusResponse,
} from '../types.js';

/**
 * ThoughtProof verification client with built-in x402 payment handling.
 *
 * Usage:
 * ```ts
 * import { ThoughtProofClient } from '@thoughtproof/skale-agent/client';
 *
 * const client = new ThoughtProofClient({
 *   serverUrl: 'https://verify.thoughtproof.ai',
 *   privateKey: '0x...', // for x402 payments
 * });
 *
 * const sentinel = await client.sentinel({ action: 'transfer 100 USDC' });
 * if (sentinel.verdict === 'ALLOW') {
 *   const rv = await client.verify({ claim: 'Transfer is safe' });
 * }
 * ```
 */
export class ThoughtProofClient {
  private readonly serverUrl: string;
  private readonly privateKey?: `0x${string}`;
  private readonly maxPaymentAmount?: bigint;
  private x402Fetch: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

  constructor(config: ThoughtProofClientConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '');
    this.privateKey = config.privateKey;
    this.maxPaymentAmount = config.maxPaymentAmount;
  }

  /**
   * Initialize x402 payment capabilities.
   * Call this before using paid endpoints if you want automatic payment.
   * Requires @x402/core and @x402/evm as peer dependencies.
   */
  async initPayments(): Promise<void> {
    if (!this.privateKey) {
      throw new Error('privateKey required for x402 payments');
    }

    try {
      // Dynamic imports — these are peer dependencies
      const { x402Client, x402HTTPClient } = await import('@x402/core/client');
      const { ExactEvmScheme } = await import('@x402/evm');
      const { privateKeyToAccount } = await import('viem/accounts');

      const account = privateKeyToAccount(this.privateKey);
      const evmScheme = new ExactEvmScheme(account);
      const coreClient = new x402Client().register('eip155:*', evmScheme);
      const httpClient = new x402HTTPClient(coreClient);

      this.x402Fetch = async (url: string, init?: RequestInit): Promise<Response> => {
        const response = await fetch(url, init);

        if (response.status === 402) {
          return this.handlePayment(response, httpClient, url, init);
        }

        return response;
      };
    } catch (err) {
      throw new Error(
        'Failed to initialize x402 payments. Install peer dependencies: ' +
        'npm install @x402/core @x402/evm viem\n' +
        `Original error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Sentinel pre-execution triage */
  async sentinel(request: SentinelRequest): Promise<SentinelResponse> {
    return this.post<SentinelResponse>('/sentinel', request);
  }

  /** RV adversarial verification */
  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    return this.post<VerifyResponse>('/verify', request);
  }

  /** Health check (free, no payment) */
  async status(): Promise<StatusResponse> {
    const res = await fetch(`${this.serverUrl}/status`);
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    return res.json() as Promise<StatusResponse>;
  }

  /** Service discovery (free, no payment) */
  async discover(): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.serverUrl}/discover`);
    if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  /**
   * Full verification pipeline: Sentinel triage → RV if needed.
   * Runs Sentinel first. If ALLOW and claim provided, runs RV.
   * Cost-efficient: skips RV when Sentinel blocks.
   */
  async pipeline(request: {
    action: string;
    claim?: string;
    context?: string;
    rvTier?: 'standard' | 'deep';
  }): Promise<{
    sentinel: SentinelResponse;
    rv?: VerifyResponse;
    finalVerdict: 'ALLOW' | 'BLOCK' | 'UNCERTAIN';
  }> {
    const sentinel = await this.sentinel({
      action: request.action,
      context: request.context,
    });

    if (sentinel.verdict === 'BLOCK') {
      return { sentinel, finalVerdict: 'BLOCK' };
    }

    if (request.claim) {
      const rv = await this.verify({
        claim: request.claim,
        context: request.context,
        tier: request.rvTier ?? 'standard',
      });

      // Conservative merge: BLOCK > UNCERTAIN > ALLOW
      const finalVerdict = rv.verdict === 'BLOCK' ? 'BLOCK'
        : rv.verdict === 'UNCERTAIN' || sentinel.verdict === 'UNCERTAIN' ? 'UNCERTAIN'
        : 'ALLOW';

      return { sentinel, rv, finalVerdict };
    }

    return { sentinel, finalVerdict: sentinel.verdict };
  }

  // --- Internal ---

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };

    const fetcher = this.x402Fetch ?? fetch;
    const res = await fetcher(url, init);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`ThoughtProof ${path} failed (${res.status}): ${errText}`);
    }

    return res.json() as Promise<T>;
  }

  private async handlePayment(
    response: Response,
    httpClient: any,
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const responseBody = await response.json();
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name: string) => response.headers.get(name),
      responseBody,
    );

    // Safety cap check
    if (this.maxPaymentAmount !== undefined) {
      const amount = BigInt(paymentRequired?.accepts?.[0]?.price?.amount ?? '0');
      if (amount > this.maxPaymentAmount) {
        throw new Error(
          `Payment amount ${amount} exceeds safety cap ${this.maxPaymentAmount}. ` +
          `Increase maxPaymentAmount or check server pricing.`
        );
      }
    }

    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    const paidResponse = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...paymentHeaders,
      },
    });

    if (paidResponse.status === 402) {
      throw new Error('Payment was sent but server still returned 402. Check balance and facilitator.');
    }

    return paidResponse;
  }
}
