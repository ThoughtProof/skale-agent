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

/** PLV plan verification */
export interface PLVRequest {
  plan_steps?: Array<{
    action: string;
    description?: string;
  }>;
  trace?: Array<{
    timestamp: number;
    action: string;
    result: string;
  }>;
  context?: string;
}

export interface PLVResponse {
  verdict: 'ALLOW' | 'BLOCK' | 'UNCERTAIN';
  confidence: number;
  analysis: string;
  risk_factors?: string[];
  latency_ms: number;
}

/** Unified verification request */
export interface UnifiedVerifyRequest {
  mode?: 'sentinel' | 'rv' | 'plv' | 'combined';
  
  // Sentinel fields
  action?: string;
  step?: string;
  parameters?: Record<string, unknown>;
  risk_threshold?: number;
  
  // RV fields
  claim?: string;
  tier?: 'standard' | 'deep';
  domain?: string;
  
  // PLV fields
  plan_steps?: Array<{
    action: string;
    description?: string;
  }>;
  trace?: Array<{
    timestamp: number;
    action: string;
    result: string;
  }>;
  
  // Common
  context?: string;
}

/** Unified verification response */
export interface UnifiedVerifyResponse {
  mode: 'sentinel' | 'rv' | 'plv' | 'combined';
  verdict: 'ALLOW' | 'BLOCK' | 'UNCERTAIN';
  confidence: number;
  latency_ms: number;
  
  // Mode-specific data
  sentinel?: SentinelResponse;
  rv?: VerifyResponse;
  plv?: PLVResponse;
  
  // Combined mode - consolidated results
  combined?: {
    primary_reason: string;
    risk_factors?: string[];
    all_results: {
      plv?: PLVResponse;
      rv?: VerifyResponse;
    };
  };
}

/** Health check */
export interface StatusResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  sentinel: boolean;
  rv: boolean;
  plv?: boolean;
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
  /** PLV API backend URL */
  plvUrl?: string;
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
  /** Standard verification price in token smallest unit (default: "20000" = $0.02 USDC) */
  standardPrice?: string;
  /** Combined verification price in token smallest unit (default: "60000" = $0.06 USDC) */
  combinedPrice?: string;
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
