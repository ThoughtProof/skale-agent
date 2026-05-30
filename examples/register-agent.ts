// Example: Register ThoughtProof agent on ERC-8004 Identity Registry (SKALE)
//
// Run: npx tsx examples/register-agent.ts
// Requires: PRIVATE_KEY in .env

import 'dotenv/config';
import { ERC8004Client } from '@thoughtproof/skale-agent/erc8004';

async function main() {
  const erc = new ERC8004Client({
    privateKey: process.env.PRIVATE_KEY!,
    testnet: true,  // Start on testnet
  });

  console.log(`Wallet: ${erc.address}`);
  console.log(`Chain: ${erc.chain.name} (${erc.chain.id})\n`);

  // Register agent
  console.log('Registering ThoughtProof Verification Agent...');
  const { agentId, txHash } = await erc.registerAgent('ipfs://QmThoughtProofMetadataHash');

  console.log(`Agent ID: ${agentId}`);
  console.log(`TX: ${txHash}`);
  console.log(`Explorer: ${erc.chain.explorer}tx/${txHash}`);
  console.log(`\nAgent discoverable on https://www.8004scan.io/agents?chain=${erc.chain.id}`);

  // Verify registration
  const metadata = await erc.getAgentMetadata(agentId);
  console.log(`\nRegistered metadata: ${metadata}`);

  const agents = await erc.getAgentsByOwner();
  console.log(`Total agents owned: ${agents}`);
}

main().catch(console.error);
