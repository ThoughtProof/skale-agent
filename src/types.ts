// ThoughtProof verification types — shared between server and client

/** Sentinel pre-execution triage */
export interface SentinelRequest {
  action: string;
  context?: string;
  parameters?: Record<string, unknown>;
  risk_threshold?: number;
}

export interface SentinelResponse {
  verdict: 'ALLOW' | 'BLOCK' | 'UNCERTAIN';
  confidence: number;
  risk_score: number;
  reason: string;
  flags: string[];
  latency_ms: number;
}

/** RV adversarial verification */
export interface VerifyRequest {
  claim: string;
  context?: string;
  tier?: 'standard' | 'deep';
  domain?: string;
}

export interface VerifyResponse {
  verdict: 'ALLOW' | 'BLOCK' | 'UNCERTAIN';
  confidence: number;
  summary: string;
  objections: Array<{
    claim: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    explanation: string;
  }>;
  sources?: string[];
  attestation?: {
    type: 'tp-vc';
    hash: string;
    signature: string;
  };
  latency_ms: number;
}

/** Health check */
export interface StatusResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  sentinel: boolean;
  rv: boolean;
  uptime_seconds: number;
}

/** Server configuration */
export interface ThoughtProofServerConfig {
  /** ThoughtProof API key for backend calls */
  apiKey: string;
  /** Sentinel API backend URL */
  sentinelUrl?: string;
  /** RV API backend URL */
  rvUrl?: string;
  /** Wallet address to receive x402 payments */
  receivingAddress: `0x${string}`;
  /** SKALE network identifier (eip155:chainId) */
  network?: string;
  /** Payment token address on SKALE */
  paymentTokenAddress?: `0x${string}`;
  /** Payment token name (for x402 wire format) */
  paymentTokenName?: string;
  /** Facilitator URL for x402 settlement */
  facilitatorUrl?: string;
  /** Sentinel price in token smallest unit (default: "3000" = $0.003 USDC) */
  sentinelPrice?: string;
  /** RV standard price (default: "20000" = $0.02 USDC) */
  rvStandardPrice?: string;
  /** RV deep price (default: "80000" = $0.08 USDC) */
  rvDeepPrice?: string;
}

/** Client configuration */
export interface ThoughtProofClientConfig {
  /** Server URL where ThoughtProof agent is running */
  serverUrl: string;
  /** Private key for x402 payments (hex with 0x prefix) */
  privateKey?: `0x${string}`;
  /** Maximum payment amount in token smallest unit (safety cap) */
  maxPaymentAmount?: bigint;
}

/** ERC-8004 agent metadata */
export interface AgentMetadata {
  name: string;
  description: string;
  capabilities: string[];
  version: string;
  owner: string;
  endpoints?: {
    sentinel?: string;
    rv?: string;
    status?: string;
  };
  pricing?: {
    sentinel?: string;
    rvStandard?: string;
    rvDeep?: string;
    currency?: string;
  };
}
