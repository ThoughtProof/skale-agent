// Example: Register ThoughtProof agent on ERC-8004 Identity Registry (SKALE)
//
// Run: npx tsx examples/register-agent.ts
// Requires: PRIVATE_KEY in .env

import 'dotenv/config';
import { ERC8004Client } from '../src/erc8004/index.js';

async function main() {
  const erc = new ERC8004Client({
    privateKey: process.env.PRIVATE_KEY!,
    testnet: true,  // Start on testnet
  });

  console.log(`Wallet: ${erc.address}`);
  console.log(`Chain: ${erc.chain.name} (${erc.chain.id})\n`);

  // Register agent
  console.log('Registering ThoughtProof Verification Agent...');
  const { agentId, txHash } = await erc.registerAgent({
    name: 'ThoughtProof Verification Agent',
    description: 'AI agent verification service — Sentinel pre-execution triage + RV adversarial deep verification. Pay-per-call via x402.',
    capabilities: [
      'sentinel-triage',
      'adversarial-verification',
      'attestation',
      'reputation-tracking',
    ],
    version: '0.1.0',
    owner: erc.address,
    endpoints: {
      sentinel: 'https://verify.thoughtproof.ai/sentinel',
      rv: 'https://verify.thoughtproof.ai/verify',
      status: 'https://verify.thoughtproof.ai/status',
    },
    pricing: {
      sentinel: '$0.003',
      rvStandard: '$0.02',
      rvDeep: '$0.08',
      currency: 'USDC',
    },
  });

  console.log(`Agent ID: ${agentId}`);
  console.log(`TX: ${txHash}`);
  console.log(`Explorer: ${erc.chain.explorer}tx/${txHash}`);
  console.log(`\nAgent discoverable on https://www.8004scan.io/agents?chain=${erc.chain.id}`);

  // Verify registration
  const metadata = await erc.getAgentMetadata(agentId);
  console.log(`\nRegistered metadata: ${metadata}`);

  const agents = await erc.getAgentsByOwner();
  console.log(`Total agents owned: ${agents.length}`);
}

main().catch(console.error);
