// frontend/src/config.ts

// Central app configuration (BSC Testnet)
// Make sure these match your deployed contract and backend wrangler.toml.

const testnetConfig = {
  // Backend API base
  apiBaseUrl: 'https://referral-backend.mehedi35x.workers.dev',

  // Smart contract addresses
  contractAddress: '0x41069AAf1DAabD4C692C3A9EdCA74f6ED6E513f1', // must match wrangler.toml
  usdtAddress: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',

  // Token/chain config
  usdtDecimals: 18,
  readRpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  chainId: 97,
  startBlock: 0,

  // App constants
  registrationFee: '12',
};

export const config = testnetConfig;

// Optional theme (for future shared usage)
export const theme = {
  colors: {
    bgLightGreen: '#e8f9f1',
    bgLightGreen2: '#e0f5ed',
    deepNavy: '#0b1b3b',
    navySoft: '#163057',
    accent: '#14b8a6',
    accentDark: '#0e9c8c',
    white: '#ffffff',
    danger: '#b91c1c',
    grayLine: 'rgba(11,27,59,0.10)',
  },
};