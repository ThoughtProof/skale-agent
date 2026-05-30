// @thoughtproof/skale-agent — ThoughtProof Verification Agent for SKALE
// x402 pay-per-call Sentinel + RV with ERC-8004 identity & reputation

export type {
  SentinelRequest,
  SentinelResponse,
  VerifyRequest,
  VerifyResponse,
  StatusResponse,
  ThoughtProofServerConfig,
  ThoughtProofClientConfig,
  AgentMetadata,
} from './types.js';

export {
  SKALE_BASE_MAINNET,
  SKALE_BASE_SEPOLIA,
  ERC8004_REGISTRIES,
  TOKENS,
  DEFAULT_FACILITATOR_URL,
} from './chains.js';

// Re-export submodules
export { createServer, buildPaymentRoutes } from './server/index.js';
export { ThoughtProofClient } from './client/index.js';
export { ERC8004Client } from './erc8004/index.js';
