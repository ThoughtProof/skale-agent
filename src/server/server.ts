// ThoughtProof x402 Verification Server for SKALE
// Unified /verify endpoint with automatic backend routing (Sentinel/RV/PLV)

import { Hono } from 'hono';
import {
  SKALE_BASE_MAINNET,
  SKALE_BASE_SEPOLIA,
  TOKENS,
  DEFAULT_FACILITATOR_URL,
} from '../chains.js';
import type {
  ThoughtProofServerConfig,
  UnifiedVerifyRequest,
  UnifiedVerifyResponse,
  SentinelResponse,
  VerifyResponse,
  PLVResponse,
  StatusResponse,
} from '../types.js';

const DEFAULT_SENTINEL_URL = 'https://sentinel.thoughtproof.ai';
const DEFAULT_RV_URL = 'https://api.thoughtproof.ai/v1';
const DEFAULT_PLV_URL = 'https://verify.thoughtproof.ai/v2';

/**
 * Create a ThoughtProof verification server with unified /verify endpoint.
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
  const plvUrl = config.plvUrl ?? DEFAULT_PLV_URL;
  const network = config.network ?? SKALE_BASE_MAINNET.network;
  const facilitatorUrl = config.facilitatorUrl ?? DEFAULT_FACILITATOR_URL;

  // Determine token based on network
  const isTestnet = network.includes(String(SKALE_BASE_SEPOLIA.id));
  const defaultToken = isTestnet
    ? TOKENS.testnet.USDC.address
    : TOKENS.mainnet.USDC.address;
  const paymentTokenAddress = config.paymentTokenAddress ?? defaultToken as `0x${string}`;
  const paymentTokenName = config.paymentTokenName ?? 'Bridged USDC (SKALE Bridge)';

  // Unified pricing (single price for any mode, higher for combined)
  const standardPrice = config.standardPrice ?? '20000';  // $0.02
  const combinedPrice = config.combinedPrice ?? '60000';  // $0.06

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

  // Rate limiting middleware for verify endpoint
  app.use('/verify', async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    await next();
  });

  // --- Health endpoint (free, no payment required) ---
  app.get('/status', async (c) => {
    const [sentinelOk, rvOk, plvOk] = await Promise.all([
      checkBackend(sentinelUrl, '/sentinel/health', config.apiKey),
      checkBackend(rvUrl, '/health', config.apiKey),
      checkBackend(plvUrl, '/v2/health', ''), // PLV might not need auth for health
    ]);

    const response: StatusResponse = {
      status: sentinelOk && rvOk && plvOk ? 'ok' : (sentinelOk || rvOk || plvOk) ? 'degraded' : 'down',
      version: '0.2.0',
      sentinel: sentinelOk,
      rv: rvOk,
      plv: plvOk,
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    };
    return c.json(response);
  });

  // --- Discovery endpoint (free) — returns x402 pricing info ---
  app.get('/discover', (c) => {
    return c.json({
      agent: 'ThoughtProof Verification Agent',
      version: '0.2.0',
      network,
      endpoints: {
        verify: {
          path: '/verify',
          method: 'POST',
          price: {
            standard: standardPrice,
            combined: combinedPrice,
          },
          currency: paymentTokenName,
          description: 'Unified verification endpoint with automatic routing (Sentinel/RV/PLV)',
          modes: ['sentinel', 'rv', 'plv', 'combined'],
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

  // --- Unified verification endpoint ---
  app.post('/verify', async (c) => {
    const body = await c.req.json() as UnifiedVerifyRequest;
    const start = Date.now();

    // Auto-detect mode if not specified
    const mode = detectMode(body);
    
    try {
      let response: UnifiedVerifyResponse;

      switch (mode) {
        case 'sentinel':
          response = await handleSentinel(body, sentinelUrl, config.apiKey, start);
          break;
        case 'rv':
          response = await handleRV(body, rvUrl, config.apiKey, start);
          break;
        case 'plv':
          response = await handlePLV(body, plvUrl, config.apiKey, start);
          break;
        case 'combined':
          response = await handleCombined(body, plvUrl, rvUrl, config.apiKey, start);
          break;
        default:
          return c.json({ error: `Unsupported mode: ${mode}` }, 400);
      }

      return c.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ 
        error: 'Backend verification failed', 
        details: errorMessage,
        mode 
      }, 500);
    }
  });

  return app;
}

/**
 * Auto-detect verification mode based on request payload
 */
function detectMode(body: UnifiedVerifyRequest): string {
  // Explicit mode specified
  if (body.mode) {
    return body.mode;
  }

  // Auto-detection based on fields
  if (body.action || body.step) {
    return 'sentinel';
  }
  
  if (body.plan_steps || body.trace) {
    return 'plv';
  }
  
  // Default to RV
  return 'rv';
}

/**
 * Handle Sentinel verification
 */
async function handleSentinel(
  body: UnifiedVerifyRequest,
  sentinelUrl: string,
  apiKey: string,
  start: number
): Promise<UnifiedVerifyResponse> {
  if (!body.action && !body.step) {
    throw new Error('Missing required field for Sentinel: action or step');
  }

  const backendResponse = await fetch(`${sentinelUrl}/sentinel/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      action: body.action || body.step,
      context: body.context ?? '',
      parameters: body.parameters ?? {},
      risk_threshold: body.risk_threshold ?? 0.7,
    }),
  });

  if (!backendResponse.ok) {
    const errText = await backendResponse.text().catch(() => 'Unknown error');
    throw new Error(`Sentinel backend error (${backendResponse.status}): ${errText}`);
  }

  const result = await backendResponse.json() as Record<string, unknown>;
  const sentinelData: SentinelResponse = {
    verdict: (result.verdict as SentinelResponse['verdict']) ?? 'UNCERTAIN',
    confidence: (result.confidence as number) ?? 0,
    risk_score: (result.risk_score as number) ?? 0,
    reason: (result.reason as string) ?? '',
    flags: (result.flags as string[]) ?? [],
    latency_ms: Date.now() - start,
  };

  return {
    mode: 'sentinel',
    verdict: sentinelData.verdict,
    confidence: sentinelData.confidence,
    latency_ms: Date.now() - start,
    sentinel: sentinelData,
  };
}

/**
 * Handle RV verification
 */
async function handleRV(
  body: UnifiedVerifyRequest,
  rvUrl: string,
  apiKey: string,
  start: number
): Promise<UnifiedVerifyResponse> {
  if (!body.claim) {
    throw new Error('Missing required field for RV: claim');
  }

  const tier = body.tier ?? 'standard';
  
  const backendResponse = await fetch(`${rvUrl}/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
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
    throw new Error(`RV backend error (${backendResponse.status}): ${errText}`);
  }

  const result = await backendResponse.json() as Record<string, unknown>;
  const rvData: VerifyResponse = {
    verdict: (result.verdict as VerifyResponse['verdict']) ?? 'UNCERTAIN',
    confidence: (result.confidence as number) ?? 0,
    summary: (result.summary as string) ?? '',
    objections: (result.objections as VerifyResponse['objections']) ?? [],
    sources: result.sources as string[] | undefined,
    attestation: result.attestation as VerifyResponse['attestation'] | undefined,
    latency_ms: Date.now() - start,
  };

  return {
    mode: 'rv',
    verdict: rvData.verdict,
    confidence: rvData.confidence,
    latency_ms: Date.now() - start,
    rv: rvData,
  };
}

/**
 * Handle PLV verification
 */
async function handlePLV(
  body: UnifiedVerifyRequest,
  plvUrl: string,
  apiKey: string,
  start: number
): Promise<UnifiedVerifyResponse> {
  if (!body.plan_steps && !body.trace) {
    throw new Error('Missing required field for PLV: plan_steps or trace');
  }

  const backendResponse = await fetch(`${plvUrl}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_steps: body.plan_steps,
      trace: body.trace,
      context: body.context ?? '',
    }),
  });

  if (!backendResponse.ok) {
    const errText = await backendResponse.text().catch(() => 'Unknown error');
    throw new Error(`PLV backend error (${backendResponse.status}): ${errText}`);
  }

  const result = await backendResponse.json() as Record<string, unknown>;
  const plvData: PLVResponse = {
    verdict: (result.verdict as PLVResponse['verdict']) ?? 'UNCERTAIN',
    confidence: (result.confidence as number) ?? 0,
    analysis: (result.analysis as string) ?? '',
    risk_factors: result.risk_factors as string[] | undefined,
    latency_ms: Date.now() - start,
  };

  return {
    mode: 'plv',
    verdict: plvData.verdict,
    confidence: plvData.confidence,
    latency_ms: Date.now() - start,
    plv: plvData,
  };
}

/**
 * Handle combined PLV + RV verification
 */
async function handleCombined(
  body: UnifiedVerifyRequest,
  plvUrl: string,
  rvUrl: string,
  apiKey: string,
  start: number
): Promise<UnifiedVerifyResponse> {
  if (!body.claim || (!body.plan_steps && !body.trace)) {
    throw new Error('Combined mode requires both claim (for RV) and plan_steps/trace (for PLV)');
  }

  // Run PLV and RV in parallel
  const [plvResponse, rvResponse] = await Promise.all([
    handlePLV(body, plvUrl, apiKey, start),
    handleRV(body, rvUrl, apiKey, start),
  ]);

  // Merge verdicts: BLOCK > UNCERTAIN > ALLOW
  const finalVerdict = 
    (plvResponse.verdict === 'BLOCK' || rvResponse.verdict === 'BLOCK') ? 'BLOCK' :
    (plvResponse.verdict === 'UNCERTAIN' || rvResponse.verdict === 'UNCERTAIN') ? 'UNCERTAIN' :
    'ALLOW';

  // Calculate combined confidence (average)
  const combinedConfidence = (plvResponse.confidence + rvResponse.confidence) / 2;

  // Generate primary reason
  const primaryReason = 
    finalVerdict === 'BLOCK' 
      ? `Verification blocked: ${plvResponse.verdict === 'BLOCK' ? 'Plan analysis failed' : 'Claim verification failed'}`
      : finalVerdict === 'UNCERTAIN'
      ? 'Verification uncertain: Mixed results from plan and claim analysis'
      : 'Verification passed: Both plan and claim analysis successful';

  // Collect risk factors
  const riskFactors: string[] = [];
  if (plvResponse.plv?.risk_factors) {
    riskFactors.push(...plvResponse.plv.risk_factors);
  }
  if (rvResponse.rv?.objections) {
    riskFactors.push(...rvResponse.rv.objections.map(obj => obj.explanation));
  }

  return {
    mode: 'combined',
    verdict: finalVerdict,
    confidence: combinedConfidence,
    latency_ms: Date.now() - start,
    combined: {
      primary_reason: primaryReason,
      risk_factors: riskFactors.length > 0 ? riskFactors : undefined,
      all_results: {
        plv: plvResponse.plv,
        rv: rvResponse.rv,
      },
    },
  };
}

/**
 * Build x402 payment route config for the unified /verify endpoint.
 */
export function buildPaymentRoutes(config: ThoughtProofServerConfig) {
  const network = config.network ?? SKALE_BASE_MAINNET.network;
  const isTestnet = network.includes(String(SKALE_BASE_SEPOLIA.id));
  const defaultToken = isTestnet
    ? TOKENS.testnet.USDC.address
    : TOKENS.mainnet.USDC.address;
  const paymentTokenAddress = config.paymentTokenAddress ?? defaultToken as `0x${string}`;
  const paymentTokenName = config.paymentTokenName ?? 'Bridged USDC (SKALE Bridge)';

  const standardPrice = config.standardPrice ?? '20000';
  const combinedPrice = config.combinedPrice ?? '60000';

  // For x402 we need to determine price dynamically based on mode
  // Since we can't easily detect the mode at the x402 middleware level,
  // we'll set the standard price and handle combined pricing in the application
  return {
    'POST /verify': {
      accepts: [{
        scheme: 'exact' as const,
        network,
        payTo: config.receivingAddress,
        price: {
          amount: standardPrice, // Most requests will be standard
          asset: paymentTokenAddress,
          extra: { name: paymentTokenName, version: '2' },
        },
      }],
      description: 'ThoughtProof Unified Verification — auto-routing to Sentinel/RV/PLV',
      mimeType: 'application/json',
    },
  };
}

/** Check backend health */
async function checkBackend(baseUrl: string, path: string, apiKey: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      // Use different auth headers for different backends
      if (baseUrl.includes('api.thoughtproof.ai')) {
        headers['X-API-Key'] = apiKey;
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    const res = await fetch(`${baseUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export { DEFAULT_SENTINEL_URL, DEFAULT_RV_URL, DEFAULT_PLV_URL };