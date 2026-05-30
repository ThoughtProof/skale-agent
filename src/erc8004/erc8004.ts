// ERC-8004 Agent Registration and Discovery on SKALE
// Interacts with deployed Identity and Reputation registries

import { ethers } from 'ethers';
import {
  SKALE_BASE_MAINNET,
  SKALE_BASE_SEPOLIA,
  ERC8004_REGISTRIES,
} from '../chains.js';
import type { AgentMetadata } from '../types.js';

// Minimal ABI for ERC-8004 registries (from SKALE docs)
const IDENTITY_REGISTRY_ABI = [
  'function registerAgent(bytes32 agentId, string metadataUri) external',
  'function getAgentMetadata(bytes32 agentId) external view returns (string)',
  'function getAgentsByOwner(address owner) external view returns (bytes32[])',
  'function updateMetadata(bytes32 agentId, string newUri) external',
  'event AgentRegistered(bytes32 indexed agentId, address indexed owner, string metadataUri)',
];

const REPUTATION_REGISTRY_ABI = [
  'function recordInteraction(bytes32 agentId, bool success, uint256 weight) external',
  'function getReputation(bytes32 agentId) external view returns (uint256 score, uint256 totalInteractions, uint256 successfulInteractions, uint256 lastUpdated)',
  'function getTopAgents(uint256 limit) external view returns (bytes32[])',
  'event InteractionRecorded(bytes32 indexed agentId, bool success, uint256 weight)',
];

export interface ERC8004Config {
  /** Private key for signing transactions */
  privateKey: string;
  /** Use testnet (default: false = mainnet) */
  testnet?: boolean;
  /** Custom RPC URL (overrides default) */
  rpcUrl?: string;
}

export interface ReputationData {
  score: bigint;
  totalInteractions: bigint;
  successfulInteractions: bigint;
  lastUpdated: bigint;
}

/**
 * ERC-8004 client for agent identity and reputation on SKALE.
 *
 * Usage:
 * ```ts
 * import { ERC8004Client } from '@thoughtproof/skale-agent/erc8004';
 *
 * const erc = new ERC8004Client({ privateKey: '0x...' });
 * const agentId = await erc.registerAgent({
 *   name: 'ThoughtProof Sentinel',
 *   description: 'Pre-execution safety triage for AI agents',
 *   capabilities: ['sentinel', 'verification', 'attestation'],
 *   version: '0.1.0',
 *   owner: '0x...',
 * });
 * ```
 */
export class ERC8004Client {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly wallet: ethers.Wallet;
  private readonly identityRegistry: ethers.Contract;
  private readonly reputationRegistry: ethers.Contract;
  private readonly isTestnet: boolean;

  constructor(config: ERC8004Config) {
    this.isTestnet = config.testnet ?? false;
    const chain = this.isTestnet ? SKALE_BASE_SEPOLIA : SKALE_BASE_MAINNET;
    const rpcUrl = config.rpcUrl ?? chain.rpcUrl;

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);

    const registries = this.isTestnet ? ERC8004_REGISTRIES.testnet : ERC8004_REGISTRIES.mainnet;

    this.identityRegistry = new ethers.Contract(
      registries.identity,
      IDENTITY_REGISTRY_ABI,
      this.wallet,
    );

    this.reputationRegistry = new ethers.Contract(
      registries.reputation,
      REPUTATION_REGISTRY_ABI,
      this.wallet,
    );
  }

  /**
   * Generate a deterministic agent ID from a name.
   * Uses keccak256 hash for cross-chain compatibility.
   */
  agentId(name: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(name));
  }

  /**
   * Register a new agent on the ERC-8004 Identity Registry.
   * Returns the transaction hash and agent ID.
   */
  async registerAgent(
    metadata: AgentMetadata,
    metadataUri?: string,
  ): Promise<{ agentId: string; txHash: string }> {
    const id = this.agentId(metadata.name);

    // If no URI provided, use a data URI with JSON metadata
    const uri = metadataUri ?? `data:application/json;base64,${
      Buffer.from(JSON.stringify(metadata)).toString('base64')
    }`;

    const tx = await this.identityRegistry.registerAgent(id, uri);
    const receipt = await tx.wait();

    return {
      agentId: id,
      txHash: receipt.hash,
    };
  }

  /**
   * Update agent metadata URI.
   */
  async updateMetadata(agentName: string, metadataUri: string): Promise<string> {
    const id = this.agentId(agentName);
    const tx = await this.identityRegistry.updateMetadata(id, metadataUri);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Look up an agent's metadata URI by name or ID.
   */
  async getAgentMetadata(agentNameOrId: string): Promise<string> {
    const id = agentNameOrId.startsWith('0x') ? agentNameOrId : this.agentId(agentNameOrId);
    return this.identityRegistry.getAgentMetadata(id) as Promise<string>;
  }

  /**
   * Get all agent IDs owned by an address.
   */
  async getAgentsByOwner(owner?: string): Promise<string[]> {
    const addr = owner ?? this.wallet.address;
    return this.identityRegistry.getAgentsByOwner(addr) as Promise<string[]>;
  }

  /**
   * Record a verification interaction result (reputation feedback).
   * Typically called after a successful/failed verification.
   */
  async recordInteraction(
    agentNameOrId: string,
    success: boolean,
    weight: number = 100,
  ): Promise<string> {
    const id = agentNameOrId.startsWith('0x') ? agentNameOrId : this.agentId(agentNameOrId);
    const tx = await this.reputationRegistry.recordInteraction(id, success, weight);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Get reputation data for an agent.
   */
  async getReputation(agentNameOrId: string): Promise<ReputationData> {
    const id = agentNameOrId.startsWith('0x') ? agentNameOrId : this.agentId(agentNameOrId);
    const [score, totalInteractions, successfulInteractions, lastUpdated] =
      await this.reputationRegistry.getReputation(id);
    return { score, totalInteractions, successfulInteractions, lastUpdated };
  }

  /**
   * Get top agents by reputation score.
   */
  async getTopAgents(limit: number = 10): Promise<string[]> {
    return this.reputationRegistry.getTopAgents(limit) as Promise<string[]>;
  }

  /**
   * Get wallet address used for registration.
   */
  get address(): string {
    return this.wallet.address;
  }

  /**
   * Get chain info for the connected network.
   */
  get chain() {
    return this.isTestnet ? SKALE_BASE_SEPOLIA : SKALE_BASE_MAINNET;
  }
}
