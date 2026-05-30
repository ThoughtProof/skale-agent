// Example: ThoughtProof x402 verification client on SKALE
//
// Run: npx tsx examples/client.ts
// Requires: PRIVATE_KEY, SERVER_URL in .env

import 'dotenv/config';
import { ThoughtProofClient } from '../src/client/index.js';

async function main() {
  const client = new ThoughtProofClient({
    serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
    maxPaymentAmount: BigInt(100000), // $0.10 safety cap
  });

  // Initialize x402 payment capabilities
  await client.initPayments();
  console.log('x402 payments initialized\n');

  // 1. Discovery — what does this agent offer?
  console.log('=== Discovery ===');
  const info = await client.discover();
  console.log(JSON.stringify(info, null, 2), '\n');

  // 2. Sentinel — pre-execution safety check
  console.log('=== Sentinel: Safe action ===');
  const safe = await client.sentinel({
    action: 'Query current ETH price from CoinGecko API',
    context: 'Portfolio monitoring dashboard',
  });
  console.log(`Verdict: ${safe.verdict} (confidence: ${safe.confidence})\n`);

  // 3. Sentinel — risky action
  console.log('=== Sentinel: Risky action ===');
  const risky = await client.sentinel({
    action: 'Transfer 50 ETH to unverified address 0xdead...',
    context: 'Unknown DeFi protocol',
  });
  console.log(`Verdict: ${risky.verdict} (risk: ${risky.risk_score})\n`);

  // 4. Full pipeline — Sentinel triage → RV deep check
  console.log('=== Full Pipeline ===');
  const result = await client.pipeline({
    action: 'Execute swap of 10,000 USDC to ETH on Uniswap',
    claim: 'This swap route through Uniswap V3 offers the best price with < 0.5% slippage',
    context: 'DeFi trading agent managing $50k portfolio',
    rvTier: 'standard',
  });
  console.log(`Sentinel: ${result.sentinel.verdict}`);
  if (result.rv) {
    console.log(`RV: ${result.rv.verdict} — ${result.rv.summary}`);
  }
  console.log(`Final: ${result.finalVerdict}\n`);
}

main().catch(console.error);
