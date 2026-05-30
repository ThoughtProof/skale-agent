// ThoughtProof x402 Verification Server for SKALE
// Exposes Sentinel + RV behind x402 paywall using Hono

import { Hono } from 'hono';
import {
  SKALE_BASE_MAINNET,
  SKALE_BASE_SEPOLIA,
  TOKENS,
  DEFAULT_FACILITATOR_URL,
} from '../chains.js';
import type {
  ThoughtProofServerConfig,
  SentinelRequest,
  SentinelResponse,
  VerifyRequest,
  VerifyResponse,
  StatusResponse,
} from '../types.js';

const DEFAULT_SENTINEL_URL = 'https://sentinel.thoughtproof.ai';
const DEFAULT_RV_URL = 'https://api.thoughtproof.ai/v1';

/**
 * Create a ThoughtProof verification server with x402 payment protection.
 *
 * Usage:
 * ```ts
 * import { createServer } from '@thoughtproof/skale-agent/server';
 *
 * const app = createServer({
 *   apiKey: process.env.THOUGHTPROOF_API_KEY!,
 *   receivingAddress: '0x...',
 * });
 * ```
 */
export function createServer(config: ThoughtProofServerConfig): Hono {
  const app = new Hono();
  const startTime = Date.now();

  const sentinelUrl = config.sentinelUrl ?? DEFAULT_SENTINEL_URL;
  const rvUrl = config.rvUrl ?? DEFAULT_RV_URL;
  const network = config.network ?? SKALE_BASE_MAINNET.network;
  const facilitatorUrl = config.facilitatorUrl ?? DEFAULT_FACILITATOR_URL;

  // Determine token based on network
  const isTestnet = network.includes(String(SKALE_BASE_SEPOLIA.id));
  const defaultToken = isTestnet
    ? TOKENS.testnet.USDC.address
    : TOKENS.mainnet.USDC.address;
  const paymentTokenAddress = config.paymentTokenAddress ?? defaultToken as `0x${string}`;
  const paymentTokenName = config.paymentTokenName ?? 'Bridged USDC (SKALE Bridge)';

  // Prices in smallest unit (6 decimals for USDC)
  const sentinelPrice = config.sentinelPrice ?? '3000';      // $0.003
  const rvStandardPrice = config.rvStandardPrice ?? '20000';  // $0.02
  const rvDeepPrice = config.rvDeepPrice ?? '80000';          // $0.08

  // Simple in-memory rate limiter
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT = 60; // requests per window
  const RATE_WINDOW = 60_000; // 1 minute

  function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
      return true;
    }
    if (entry.count >= RATE_LIMIT) return false;
    entry.count++;
    return true;
  }

  // Rate limiting middleware
  app.use('/sentinel', async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    await next();
  });
  
  app.use('/verify', async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    await next();
  });

  app.use('/verify/deep', async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    await next();
  });

  // --- Health endpoint (free, no payment required) ---
  app.get('/status', async (c) => {
    const [sentinelOk, rvOk] = await Promise.all([
      checkBackend(sentinelUrl, '/sentinel/health', config.apiKey),
      checkBackend(rvUrl, '/health', config.apiKey),
    ]);

    const response: StatusResponse = {
      status: sentinelOk && rvOk ? 'ok' : sentinelOk || rvOk ? 'degraded' : 'down',
      version: '0.1.0',
      sentinel: sentinelOk,
      rv: rvOk,
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    };
    return c.json(response);
  });

  // --- Discovery endpoint (free) — returns x402 pricing info ---
  app.get('/discover', (c) => {
    return c.json({
      agent: 'ThoughtProof Verification Agent',
      version: '0.1.0',
      network,
      endpoints: {
        sentinel: {
          path: '/sentinel',
          method: 'POST',
          price: sentinelPrice,
          currency: paymentTokenName,
          description: 'Pre-execution triage — fast, cheap safety check',
        },
        verify: {
          path: '/verify',
          method: 'POST',
          price: { standard: rvStandardPrice, deep: rvDeepPrice },
          currency: paymentTokenName,
          description: 'Adversarial verification — deep substance check',
        },
        status: { path: '/status', method: 'GET', price: 'free' },
        discover: { path: '/discover', method: 'GET', price: 'free' },
      },
      paymentInfo: {
        protocol: 'x402',
        network,
        payTo: config.receivingAddress,
        asset: paymentTokenAddress,
        facilitator: facilitatorUrl,
      },
    });
  });

  // --- Sentinel endpoint ---
  app.post('/sentinel', async (c) => {
    const body = await c.req.json() as SentinelRequest;

    if (!body.action) {
      return c.json({ error: 'Missing required field: action' }, 400);
    }

    const start = Date.now();
    const backendResponse = await fetch(`${sentinelUrl}/sentinel/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        action: body.action,
        context: body.context ?? '',
        parameters: body.parameters ?? {},
        risk_threshold: body.risk_threshold ?? 0.7,
      }),
    });

    if (!backendResponse.ok) {
      const errText = await backendResponse.text().catch(() => 'Unknown error');
      return c.json(
        { error: 'Sentinel backend error', details: errText },
        backendResponse.status as 500,
      );
    }

    const result = await backendResponse.json() as Record<string, unknown>;
    const response: SentinelResponse = {
      verdict: (result.verdict as SentinelResponse['verdict']) ?? 'UNCERTAIN',
      confidence: (result.confidence as number) ?? 0,
      risk_score: (result.risk_score as number) ?? 0,
      reason: (result.reason as string) ?? '',
      flags: (result.flags as string[]) ?? [],
      latency_ms: Date.now() - start,
    };

    return c.json(response);
  });

  // --- RV Verify endpoint ---
  const handleVerify = async (c: any, forceTier?: 'deep') => {
    const body = await c.req.json() as VerifyRequest;

    if (!body.claim) {
      return c.json({ error: 'Missing required field: claim' }, 400);
    }

    const tier = forceTier ?? body.tier ?? 'standard';
    const start = Date.now();

    const backendResponse = await fetch(`${rvUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        claim: body.claim,
        context: body.context ?? '',
        tier,
        domain: body.domain,
      }),
    });

    if (!backendResponse.ok) {
      const errText = await backendResponse.text().catch(() => 'Unknown error');
      return c.json(
        { error: 'RV backend error', details: errText },
        backendResponse.status as 500,
      );
    }

    const result = await backendResponse.json() as Record<string, unknown>;
    const response: VerifyResponse = {
      verdict: (result.verdict as VerifyResponse['verdict']) ?? 'UNCERTAIN',
      confidence: (result.confidence as number) ?? 0,
      summary: (result.summary as string) ?? '',
      objections: (result.objections as VerifyResponse['objections']) ?? [],
      sources: result.sources as string[] | undefined,
      attestation: result.attestation as VerifyResponse['attestation'] | undefined,
      latency_ms: Date.now() - start,
    };

    return c.json(response);
  };

  app.post('/verify', (c) => handleVerify(c));

  // --- RV Deep Verify endpoint ---
  app.post('/verify/deep', (c) => handleVerify(c, 'deep'));

  return app;
}

/**
 * Build x402 payment route config for use with @x402/hono paymentMiddleware.
 * Returns the routes object that maps endpoints to their payment requirements.
 */
export function buildPaymentRoutes(config: ThoughtProofServerConfig) {
  const network = config.network ?? SKALE_BASE_MAINNET.network;
  const isTestnet = network.includes(String(SKALE_BASE_SEPOLIA.id));
  const defaultToken = isTestnet
    ? TOKENS.testnet.USDC.address
    : TOKENS.mainnet.USDC.address;
  const paymentTokenAddress = config.paymentTokenAddress ?? defaultToken as `0x${string}`;
  const paymentTokenName = config.paymentTokenName ?? 'Bridged USDC (SKALE Bridge)';

  const sentinelPrice = config.sentinelPrice ?? '3000';
  const rvStandardPrice = config.rvStandardPrice ?? '20000';
  const rvDeepPrice = config.rvDeepPrice ?? '80000';

  return {
    'POST /sentinel': {
      accepts: [{
        scheme: 'exact' as const,
        network,
        payTo: config.receivingAddress,
        price: {
          amount: sentinelPrice,
          asset: paymentTokenAddress,
          extra: { name: paymentTokenName, version: '1' },
        },
      }],
      description: 'ThoughtProof Sentinel — pre-execution safety triage',
      mimeType: 'application/json',
    },
    'POST /verify': {
      accepts: [{
        scheme: 'exact' as const,
        network,
        payTo: config.receivingAddress,
        price: {
          amount: rvStandardPrice,
          asset: paymentTokenAddress,
          extra: { name: paymentTokenName, version: '1' },
        },
      }],
      description: 'ThoughtProof RV — adversarial substance verification (standard)',
      mimeType: 'application/json',
    },
    'POST /verify/deep': {
      accepts: [{
        scheme: 'exact' as const,
        network,
        payTo: config.receivingAddress,
        price: {
          amount: rvDeepPrice,
          asset: paymentTokenAddress,
          extra: { name: paymentTokenName, version: '1' },
        },
      }],
      description: 'ThoughtProof RV — adversarial deep verification',
      mimeType: 'application/json',
    },
  };
}

/** Check backend health */
async function checkBackend(baseUrl: string, path: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export { DEFAULT_SENTINEL_URL, DEFAULT_RV_URL };
