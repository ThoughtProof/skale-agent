# @thoughtproof/skale-agent

ThoughtProof Verification Agent for SKALE — x402 pay-per-call Sentinel + RV endpoints with ERC-8004 identity & reputation.

## What This Is

A complete toolkit for deploying ThoughtProof's AI verification services as a native agent on SKALE:

- **x402 Seller Server** — Sentinel + RV behind gasless x402 paywall on SKALE Base
- **x402 Client** — Discover, pay, and verify in one call with automatic payment handling
- **ERC-8004 Identity** — Register as an agent on SKALE's Identity + Reputation registries
- **Pipeline** — Sentinel triage → RV deep check, cost-optimized (skips RV when Sentinel blocks)

## Install

```bash
npm install @thoughtproof/skale-agent
```

For x402 payment support (peer dependencies):
```bash
npm install @x402/core @x402/evm @x402/hono viem
```

## Quick Start

### Run a Verification Server

```typescript
import { createServer, buildPaymentRoutes } from '@thoughtproof/skale-agent/server';
import { serve } from '@hono/node-server';

const app = createServer({
  apiKey: process.env.THOUGHTPROOF_API_KEY!,
  receivingAddress: '0xYourWallet',
});

serve({ fetch: app.fetch, port: 3000 });
```

Endpoints:
| Path | Method | Price | Description |
|------|--------|-------|-------------|
| `/sentinel` | POST | $0.003 | Pre-execution safety triage |
| `/verify` | POST | $0.02 | Adversarial substance verification |
| `/status` | GET | Free | Health check |
| `/discover` | GET | Free | Service discovery with pricing |

### Use the Client

```typescript
import { ThoughtProofClient } from '@thoughtproof/skale-agent/client';

const client = new ThoughtProofClient({
  serverUrl: 'https://verify.thoughtproof.ai',
  privateKey: '0x...',
  maxPaymentAmount: BigInt(100000), // $0.10 safety cap
});

await client.initPayments();

// Full pipeline: Sentinel → RV
const result = await client.pipeline({
  action: 'Transfer 10 ETH to 0xabc...',
  claim: 'This transfer is to a verified exchange address',
});

console.log(result.finalVerdict); // 'ALLOW' | 'BLOCK' | 'UNCERTAIN'
```

### Register on ERC-8004

```typescript
import { ERC8004Client } from '@thoughtproof/skale-agent/erc8004';

const erc = new ERC8004Client({
  privateKey: process.env.PRIVATE_KEY!,
  testnet: true,
});

const { agentId, txHash } = await erc.registerAgent({
  name: 'ThoughtProof Verification Agent',
  description: 'AI verification — Sentinel triage + RV adversarial deep check',
  capabilities: ['sentinel-triage', 'adversarial-verification', 'attestation'],
  version: '0.1.0',
  owner: erc.address,
});
```

## Architecture

```
Agent (any AI agent on SKALE)
  │
  ├── discovers ThoughtProof via ERC-8004 registry or /discover
  ├── calls /sentinel ($0.003 via x402) → ALLOW / BLOCK / UNCERTAIN
  │     └── if BLOCK → stop, save money
  └── calls /verify ($0.02 via x402) → deep adversarial check
        └── returns verdict + objections + optional attestation
```

**Cost optimization:** Sentinel costs 7x less than RV. The pipeline runs Sentinel first and only escalates to RV when the action passes triage. Blocked actions never reach the expensive endpoint.

**Conservative verdict merger:** BLOCK > UNCERTAIN > ALLOW. If Sentinel says ALLOW but RV says BLOCK, the final verdict is BLOCK.

## SKALE Network Details

### Mainnet (SKALE Base)
- Chain ID: `1187947933`
- RPC: `https://skale-base.skalenodes.com/v1/base`
- Zero gas fees — all payment goes to the service

### Testnet (SKALE Base Sepolia)
- Chain ID: `324705682`
- RPC: `https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha`
- Faucet: https://base-sepolia-faucet.skale.space

### ERC-8004 Registry Addresses

| Registry | Mainnet | Testnet |
|----------|---------|---------|
| Identity | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

## Why SKALE

- **Zero gas fees** — every cent goes to the verification service, not to miners
- **Sub-second finality** — critical for real-time agent decisions
- **Native x402** — HTTP-native payments, no API keys or subscriptions
- **ERC-8004** — onchain agent identity and reputation, discoverable on [8004scan.io](https://www.8004scan.io)
- **Programmable privacy** — verification payloads stay confidential

## Related

- [ThoughtProof](https://thoughtproof.ai) — AI verification platform
- [@thoughtproof/goat-plugin](https://npmjs.com/package/@thoughtproof/goat-plugin) — GOAT AgentKit plugin
- [SKALE Agentic Commerce](https://docs.skale.space/get-started/agentic-commerce/skale-agentic-commerce)
- [x402 Protocol](https://x402.org)
- [ERC-8004](https://www.8004scan.io)

## License

MIT
