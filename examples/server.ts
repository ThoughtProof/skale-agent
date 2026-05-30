// Example: ThoughtProof x402 verification server on SKALE
//
// Run: npx tsx examples/server.ts
// Requires: THOUGHTPROOF_API_KEY, RECEIVING_ADDRESS in .env

import 'dotenv/config';
import { serve } from '@hono/node-server';
import { paymentMiddleware, x402ResourceServer } from '@x402/hono';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { createServer, buildPaymentRoutes } from '@thoughtproof/skale-agent/server';
import { SKALE_BASE_SEPOLIA, DEFAULT_FACILITATOR_URL } from '@thoughtproof/skale-agent';
import type { ThoughtProofServerConfig } from '@thoughtproof/skale-agent';

const config: ThoughtProofServerConfig = {
  apiKey: process.env.THOUGHTPROOF_API_KEY!,
  receivingAddress: process.env.RECEIVING_ADDRESS as `0x${string}`,
  network: SKALE_BASE_SEPOLIA.network,  // testnet for demo
  facilitatorUrl: DEFAULT_FACILITATOR_URL,
};

const app = createServer(config);

// Add x402 payment middleware
const facilitatorClient = new HTTPFacilitatorClient({ url: config.facilitatorUrl! });
const resourceServer = new x402ResourceServer(facilitatorClient);
resourceServer.register('eip155:*', new ExactEvmScheme());

const paymentRoutes = buildPaymentRoutes(config);
app.use(paymentMiddleware(paymentRoutes, resourceServer));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`ThoughtProof verification server running on http://localhost:${port}`);
  console.log(`Network: ${config.network}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /status   — free health check`);
  console.log(`  GET  /discover — free service discovery`);
  console.log(`  POST /sentinel — $0.003 pre-execution triage`);
  console.log(`  POST /verify   — $0.02  adversarial verification`);
});
