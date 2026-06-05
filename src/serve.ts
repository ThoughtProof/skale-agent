#!/usr/bin/env node
// Standalone server entrypoint for ThoughtProof SKALE Agent
// Usage: npx tsx src/serve.ts

import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createServer } from './server/server.js';

const apiKey = process.env.THOUGHTPROOF_API_KEY;
const receivingAddress = process.env.RECEIVING_ADDRESS;
const port = parseInt(process.env.PORT ?? '3000', 10);

if (!apiKey) {
  console.error('❌ THOUGHTPROOF_API_KEY not set');
  process.exit(1);
}
if (!receivingAddress) {
  console.error('❌ RECEIVING_ADDRESS not set');
  process.exit(1);
}

const app = createServer({
  apiKey,
  receivingAddress: receivingAddress as `0x${string}`,
});

console.log(`🚀 ThoughtProof SKALE Agent v0.2.0`);
console.log(`   Port: ${port}`);
console.log(`   Receiving: ${receivingAddress}`);
console.log(`   Backends: Sentinel + RV + PLV (unified /verify)`);
console.log(`   x402: disabled (smoke-test mode)`);
console.log('');

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`✅ Listening on http://localhost:${info.port}`);
});
