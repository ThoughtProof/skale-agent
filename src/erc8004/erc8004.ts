// ERC-8004 Agent Registration and Discovery on SKALE
// Interacts with deployed Identity and Reputation registries

// TODO: migrate from ethers to viem for smaller bundle size (ethers = 15MB)
// viem is already a peer dependency for x402 integration

import { ethers } from 'ethers';
import {
  SKALE_BASE_MAINNET,
  SKALE_BASE_SEPOLIA,
  ERC8004_REGISTRIES,
} from '../chains.js';
import type { AgentMetadata } from '../types.js';

// Corrected ABI for ERC-8004 registries (ERC-721 based Identity Registry)
const IDENTITY_REGISTRY_ABI = [
  'function register(string agentURI) external returns (uint256)',
  'function register(string agentURI, tuple(string metadataKey, bytes metadataValue)[] metadata) external returns (uint256)',
  'function setMetadata(uint256 agentId, string key, bytes value) external',
  'function getMetadata(uint256 agentId, string key) external view returns (bytes)',
  'function setAgentURI(uint256 agentId, string newURI) external',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
];

const REPUTATION_REGISTRY_ABI = [
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external',
  'function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external',
  'function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) external view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)',
  'function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64)',
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
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
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  isRevoked: boolean;
}

/**
 * ERC-8004 client for agent identity and reputation on SKALE.
 *
 * Usage:
 * ```ts
 * import { ERC8004Client } from '@thoughtproof/skale-agent/erc8004';
 *
 * const erc = new ERC8004Client({ privateKey: '0x...' });
 * const { agentId } = await erc.registerAgent('ipfs://metadata-uri');
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
   * Register a new agent on the ERC-8004 Identity Registry.
   * Returns the transaction hash and agent ID (ERC-721 token ID).
   */
  async registerAgent(metadataUri: string): Promise<{ agentId: bigint; txHash: string }> {
    const tx = await this.identityRegistry.register(metadataUri);
    const receipt = await tx.wait();
    
    // Parse the Registered event to get the agentId
    const event = receipt.logs.find((log: any) => {
      try {
        return this.identityRegistry.interface.parseLog(log)?.name === 'Registered';
      } catch { return false; }
    });
    
    if (!event) {
      throw new Error('Registered event not found in transaction receipt');
    }
    
    const parsed = this.identityRegistry.interface.parseLog(event);
    if (!parsed) {
      throw new Error('Failed to parse Registered event');
    }
    return { agentId: parsed.args.agentId, txHash: receipt.hash };
  }

  /**
   * Update agent metadata URI.
   */
  async updateMetadata(agentId: bigint, metadataUri: string): Promise<string> {
    const tx = await this.identityRegistry.setAgentURI(agentId, metadataUri);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Look up an agent's metadata URI by token ID.
   */
  async getAgentMetadata(agentId: bigint): Promise<string> {
    return this.identityRegistry.tokenURI(agentId) as Promise<string>;
  }

  /**
   * Get number of agents owned by an address.
   */
  async getAgentsByOwner(owner?: string): Promise<bigint> {
    const addr = owner ?? this.wallet.address;
    return this.identityRegistry.balanceOf(addr) as Promise<bigint>;
  }

  /**
   * Give feedback for an agent (reputation data).
   * Typically called after a verification interaction.
   */
  async giveFeedback(
    agentId: bigint,
    value: bigint,
    valueDecimals: number,
    tag1: string,
    tag2: string,
    endpoint: string,
    feedbackURI: string,
    feedbackHash: string,
  ): Promise<string> {
    const tx = await this.reputationRegistry.giveFeedback(
      agentId,
      value,
      valueDecimals,
      tag1,
      tag2,
      endpoint,
      feedbackURI,
      feedbackHash,
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Read feedback for an agent from a specific client.
   */
  async readFeedback(agentId: bigint, clientAddress: string, feedbackIndex: number): Promise<ReputationData> {
    const [value, valueDecimals, tag1, tag2, isRevoked] =
      await this.reputationRegistry.readFeedback(agentId, clientAddress, feedbackIndex);
    return { value, valueDecimals, tag1, tag2, isRevoked };
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
