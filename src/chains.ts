// SKALE chain definitions for viem/ethers
// SKALE Base Mainnet and Sepolia Testnet

export const SKALE_BASE_MAINNET = {
  id: 1187947933,
  name: 'SKALE Base',
  rpcUrl: 'https://skale-base.skalenodes.com/v1/base',
  wssUrl: 'wss://skale-base.skalenodes.com/v1/ws/base',
  explorer: 'https://skale-base-explorer.skalenodes.com/',
  nativeCurrency: { name: 'Credits', symbol: 'CREDIT', decimals: 18 },
  network: 'eip155:1187947933' as const,
} as const;

export const SKALE_BASE_SEPOLIA = {
  id: 324705682,
  name: 'SKALE Base Sepolia',
  rpcUrl: 'https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha',
  explorer: 'https://base-sepolia-testnet-explorer.skalenodes.com/',
  nativeCurrency: { name: 'Credits', symbol: 'CREDIT', decimals: 18 },
  faucet: 'https://base-sepolia-faucet.skale.space',
  network: 'eip155:324705682' as const,
} as const;

// ERC-8004 Registry Addresses (canonical cross-chain addresses)
export const ERC8004_REGISTRIES = {
  mainnet: {
    identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const,
    reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as const,
  },
  testnet: {
    identity: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const,
    reputation: '0x8004B663056A597Dffe9eCcC1965A193B7388713' as const,
  },
} as const;

// Bridged tokens on SKALE Base
export const TOKENS = {
  mainnet: {
    // TODO: verify checksum address on-chain
    USDC: { address: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20' as const, decimals: 6, symbol: 'USDC.e' },
    USDT: { address: '0x2bF09eFf5aA089BD00C054931C6B02e88f47fCa' as const, decimals: 6, symbol: 'USDT' },
  },
  testnet: {
    USDC: { address: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD' as const, decimals: 6, symbol: 'USDC.e' },
  },
} as const;

// Default facilitator (Ultravioleta DAO — production, supports SKALE Base)
export const DEFAULT_FACILITATOR_URL = 'https://facilitator.ultravioletadao.xyz';
