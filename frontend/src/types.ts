/**
 * Represents the data structure for user information fetched from the off-chain database.
 */
export interface OffChainUserData {
  userId: string;
  coin_balance: number;
  referralStats: {
    total_referrals: number;
    level1_count: number;
    level2_count: number;
    level3_count: number;
  };
  earningHistory: Earning[];
}

/**
 * Represents a single earning event in the user's history.
 */
export interface Earning {
  date: string;
  from_user_id: string;
  amount: number;
  level: number;
}
