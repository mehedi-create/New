// frontend/src/utils/contract.ts
import {
  ethers,
  Contract,
  JsonRpcProvider,
  BrowserProvider,
  AbstractProvider,
} from 'ethers';
import { config } from '../config';

// ERC20 (USDT) minimal ABI
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// CommunityPlatform ABI (unified contract)
const PLATFORM_ABI = [
  // core
  'function register(string _userId, string _referrerId, string _fundCode) external',
  'function withdrawWithFundCode(string _code) external',
  'function withdrawCommission() external',          // owner-only
  'function withdrawLiquidity(uint256 amount) external', // owner-only
  'function emergencyWithdrawAll() external',        // owner-only
  // mining (vault + counters)
  'function buyMiner(uint256 amount) external returns (uint256)',
  'function getUserMiningStats(address user) external view returns (uint256 count, uint256 totalDeposited)',
  // views
  'function userBalances(address) view returns (uint256)',
  'function adminCommissions(address) view returns (uint256)',
  'function getContractBalance() view returns (uint256)',
  'function hasSetFundCode(address) view returns (bool)',
  'function isRegistered(address) view returns (bool)',
  'function addressToUserId(address) view returns (string)',
  'function owner() view returns (address)',
  'function admins(address) view returns (bool)',
];

const USDT_DECIMALS = Number((config as any).usdtDecimals ?? 18);
const READ_RPC_URL = (config as any).readRpcUrl || '';
const CONTRACT_ADDRESS = config.contractAddress;
const USDT_ADDRESS = (config as any).usdtAddress;

// Read provider (RPC > injected)
const getReadProvider = (): AbstractProvider => {
  if (READ_RPC_URL) return new JsonRpcProvider(READ_RPC_URL);
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    return new BrowserProvider((window as any).ethereum);
  }
  throw new Error('READ_RPC_URL not configured and no injected wallet found');
};

const getSigner = async () => {
  if (!(window as any).ethereum) throw new Error('Wallet not found');
  const provider = new BrowserProvider((window as any).ethereum);
  return provider.getSigner();
};

const getPlatformContractRead = () =>
  new Contract(CONTRACT_ADDRESS, PLATFORM_ABI, getReadProvider());

const getPlatformContractWrite = async () => {
  const signer = await getSigner();
  return new Contract(CONTRACT_ADDRESS, PLATFORM_ABI, signer);
};

// Auth message (for backend sync/login)
export const buildAuthMessage = (address: string, timestamp: number) =>
  `I authorize the backend to sync my on-chain profile.\nAddress: ${ethers.getAddress(address)}\nTimestamp: ${timestamp}`;

export const signAuthMessage = async (address: string) => {
  const signer = await getSigner();
  const ts = Math.floor(Date.now() / 1000);
  const msg = buildAuthMessage(address, ts);
  const signature = await signer.signMessage(msg);
  return { message: msg, timestamp: ts, signature };
};

// -------- Read helpers --------
export const isRegistered = async (address: string): Promise<boolean> => {
  const contract = getPlatformContractRead();
  return contract.isRegistered(address);
};

export const addressToUserId = async (address: string): Promise<string> => {
  const contract = getPlatformContractRead();
  return contract.addressToUserId(address);
};

export const getOwner = async (): Promise<string> => {
  const contract = getPlatformContractRead();
  return contract.owner();
};

export const isAdmin = async (address: string): Promise<boolean> => {
  const contract = getPlatformContractRead();
  return contract.admins(address);
};

export const getContractBalance = async (): Promise<string> => {
  const contract = getPlatformContractRead();
  const balance = await contract.getContractBalance();
  return ethers.formatUnits(balance, USDT_DECIMALS);
};

export const getAdminCommission = async (address: string): Promise<string> => {
  const contract = getPlatformContractRead();
  const commission = await contract.adminCommissions(address);
  return ethers.formatUnits(commission, USDT_DECIMALS);
};

export const getUserBalance = async (address: string): Promise<string> => {
  const contract = getPlatformContractRead();
  const balance = await contract.userBalances(address);
  return ethers.formatUnits(balance, USDT_DECIMALS);
};

export const hasSetFundCode = async (address: string): Promise<boolean> => {
  const contract = getPlatformContractRead();
  return contract.hasSetFundCode(address);
};

// Mining (read)
export const getUserMiningStatsRaw = async (address: string): Promise<{ count: bigint; totalDeposited: bigint }> => {
  const contract = getPlatformContractRead();
  const [count, totalDeposited] = await contract.getUserMiningStats(address);
  // Ethers v6 returns BigInt for uint256
  return { count: BigInt(count), totalDeposited: BigInt(totalDeposited) };
};

export const getUserMiningStats = async (address: string): Promise<{ count: number; totalDeposited: string }> => {
  const raw = await getUserMiningStatsRaw(address);
  return {
    count: Number(raw.count),
    totalDeposited: ethers.formatUnits(raw.totalDeposited, USDT_DECIMALS),
  };
};

// -------- Write helpers --------
export const approveUSDT = async (amount: string) => {
  const signer = await getSigner();
  const usdt = new Contract(USDT_ADDRESS, ERC20_ABI, signer);
  const amt = ethers.parseUnits(amount, USDT_DECIMALS);
  return usdt.approve(CONTRACT_ADDRESS, amt);
};

export const registerUser = async (userId: string, referrerId: string, fundCode: string) => {
  const contract = await getPlatformContractWrite();
  return contract.register(
    userId.trim().toUpperCase(),
    referrerId.trim().toUpperCase(),
    fundCode
  );
};

export const withdrawWithFundCode = async (code: string) => {
  const contract = await getPlatformContractWrite();
  return contract.withdrawWithFundCode(code);
};

export const withdrawCommission = async () => {
  const contract = await getPlatformContractWrite();
  return contract.withdrawCommission(); // owner only
};

export const withdrawLiquidity = async (amount: string) => {
  const contract = await getPlatformContractWrite();
  const amt = ethers.parseUnits(amount, USDT_DECIMALS);
  return contract.withdrawLiquidity(amt); // owner only
};

export const emergencyWithdrawAll = async () => {
  const contract = await getPlatformContractWrite();
  return contract.emergencyWithdrawAll(); // owner only
};

// Mining (write)
export const buyMiner = async (amount: string) => {
  const contract = await getPlatformContractWrite();
  const amt = ethers.parseUnits(amount, USDT_DECIMALS);
  return contract.buyMiner(amt);
};
