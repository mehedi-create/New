// frontend/src/pages/Dashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '../context/WalletContext';
import {
  withdrawWithFundCode,
  getUserBalance,
  hasSetFundCode,
  getOwner,
  isAdmin,
  getAdminCommission,
  getContractBalance,
  withdrawCommission,
  emergencyWithdrawAll,
  signAuthMessage,
} from '../utils/contract';
import { showSuccessToast, showErrorToast } from '../utils/notification';
import { config } from '../config';
import { api, getDashboardData, upsertUserFromChain } from '../services/api';
import { ethers, BrowserProvider } from 'ethers';

type Role = 'user' | 'admin' | 'owner';

type OnChainData = {
  userBalance: string;
  hasFundCode: boolean;
  role: Role;
  contractBalance?: string;
  adminCommission?: string;
};

type OffChainData = {
  userId: string;
  referralStats: {
    total_referrals: number;
    level1_count: number;
    level2_count: number;
    level3_count: number;
  };
  logins: {
    total_login_days: number;
  };
  notices: Array<{
    id: number;
    title: string;
    content_html: string;
    image_url?: string;
    link_url?: string;
    priority: number;
    created_at: string;
  }>;
  commissions?: {
    percentages: { l1: number; l2: number; l3: number };
    registration_fee_raw: string;
    l1_total_raw: string;
    l2_total_raw: string;
    l3_total_raw: string;
    total_estimated_raw: string;
  };
};

const colors = {
  bgLightGreen: '#e8f9f1',
  bgLightGreen2: '#e0f5ed',
  deepNavy: '#0b1b3b',
  navySoft: '#163057',
  accent: '#14b8a6',
  accentDark: '#0e9c8c',
  white: '#ffffff',
  danger: '#b91c1c',
  grayLine: 'rgba(11,27,59,0.10)',
};

const styles = {
  page: {
    minHeight: '100vh',
    width: '100%',
    background: `linear-gradient(180deg, ${colors.bgLightGreen} 0%, ${colors.bgLightGreen2} 100%)`,
    color: colors.deepNavy,
    userSelect: 'none' as const,
  },
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '20px 14px 40px',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap' as const,
  },
  brand: {
    fontWeight: 900,
    fontSize: 18,
    letterSpacing: 0.3,
  },
  userBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'rgba(11,27,59,0.12)',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
  },
  logoutBtn: {
    height: 36,
    padding: '0 12px',
    borderRadius: 12,
    border: '1px solid rgba(11,27,59,0.15)',
    background: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    fontWeight: 700,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 14,
    alignItems: 'stretch',
  },
  card: {
    background: 'rgba(255,255,255,0.6)',
    border: `1px solid ${colors.grayLine}`,
    borderRadius: 16,
    padding: 16,
    minHeight: 160,
    boxShadow: '0 12px 24px rgba(11,27,59,0.06)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  cardTall: {
    minHeight: 220,
  },
  cardTitle: {
    margin: '0 0 6px 0',
    fontSize: 16,
    fontWeight: 900,
  },
  statRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 10,
  },
  statBox: {
    background: 'rgba(255,255,255,0.7)',
    border: `1px solid ${colors.grayLine}`,
    borderRadius: 14,
    padding: 12,
    textAlign: 'center' as const,
  },
  statLabel: {
    fontSize: 12,
    color: colors.navySoft,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 900,
  },
  balance: {
    fontSize: 28,
    fontWeight: 900,
    margin: '6px 0 6px',
  },
  button: {
    height: 44,
    borderRadius: 12,
    background: colors.accent,
    color: colors.white,
    border: 'none',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    padding: '0 14px',
  },
  buttonGhost: {
    height: 44,
    borderRadius: 12,
    background: 'transparent',
    color: colors.deepNavy,
    border: `1px solid ${colors.grayLine}`,
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    padding: '0 14px',
  },
  buttonDanger: {
    height: 44,
    borderRadius: 12,
    background: colors.danger,
    color: colors.white,
    border: 'none',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    padding: '0 14px',
  },
  row: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap' as const,
    width: '100%',
  },
  input: {
    height: 44,
    borderRadius: 12,
    border: `1px solid ${colors.grayLine}`,
    padding: '0 12px',
    background: colors.white,
    outline: 'none',
    color: colors.deepNavy,
    fontSize: 14,
    width: '100%',
  },
  copyWrap: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 8,
    alignItems: 'center',
  },
  noticeScroller: {
    display: 'flex',
    gap: 12,
    overflowX: 'auto' as const,
    paddingBottom: 6,
    scrollSnapType: 'x mandatory' as any, // mobile-friendly horizontal scroll snapping
    // Removed WebkitOverflowScrolling to avoid TS type error
  },
  noticeCard: {
    minWidth: 280,
    maxWidth: 360,
    background: 'rgba(255,255,255,0.85)',
    border: `1px solid ${colors.grayLine}`,
    borderRadius: 14,
    padding: 12,
    flex: '0 0 auto',
    cursor: 'pointer',
    scrollSnapAlign: 'start',
  },
  noticeImg: {
    width: '100%',
    height: 140,
    objectFit: 'cover' as const,
    borderRadius: 10,
    marginBottom: 10,
    background: '#f2f5f7',
  },
  small: { fontSize: 12, color: colors.navySoft },
  muted: { opacity: 0.8 },
  adminPanel: {
    marginTop: 6,
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 10,
  },
  textarea: {
    minHeight: 120,
    borderRadius: 12,
    padding: 12,
    border: `1px solid ${colors.grayLine}`,
    fontFamily: 'monospace',
    fontSize: 13,
    background: colors.white,
    color: colors.deepNavy,
    outline: 'none',
    width: '100%',
  },
  divider: {
    height: 1,
    background: colors.grayLine,
    margin: '8px 0',
  },
} satisfies Record<string, React.CSSProperties | any>;

const useIsMobile = (bp = 768) => {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < bp : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < bp);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bp]);
  return isMobile;
};

const DangerousHtml: React.FC<{ html: string }> = ({ html }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = html || '';
    const scripts = Array.from(ref.current.querySelectorAll('script'));
    scripts.forEach((oldScript) => {
      const s = document.createElement('script');
      for (const { name, value } of Array.from(oldScript.attributes)) {
        s.setAttribute(name, value);
      }
      s.textContent = oldScript.textContent;
      oldScript.replaceWith(s);
    });
  }, [html]);
  return <div ref={ref} />;
};

const Dashboard: React.FC = () => {
  const isMobile = useIsMobile();
  const { account, userId, disconnect } = useWallet();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('copy', prevent);
    document.addEventListener('cut', prevent);
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('selectstart', prevent);
    return () => {
      document.removeEventListener('copy', prevent);
      document.removeEventListener('cut', prevent);
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('selectstart', prevent);
    };
  }, []);

  const { data: onChainData, isLoading: isOnChainLoading, refetch: refetchOnChain } = useQuery<OnChainData | null>({
    queryKey: ['onChainData', account],
    enabled: !!account,
    queryFn: async () => {
      if (!account) return null;
      const [owner, adminFlag, balance, hasCode] = await Promise.all([
        getOwner(),
        isAdmin(account),
        getUserBalance(account),
        hasSetFundCode(account),
      ]);
      let role: Role = 'user';
      if (account.toLowerCase() === owner.toLowerCase()) role = 'owner';
      else if (adminFlag) role = 'admin';
      const data: OnChainData = { userBalance: balance, hasFundCode: hasCode, role };
      if (role !== 'user') {
        const [contractBal, adminComm] = await Promise.all([getContractBalance(), getAdminCommission(account)]);
        data.contractBalance = contractBal;
        data.adminCommission = adminComm;
      }
      return data;
    },
  });

  const { data: offChainData, isLoading: isOffChainLoading, refetch: refetchOffChain } = useQuery<OffChainData>({
    queryKey: ['offChainData', account],
    enabled: !!account,
    queryFn: async () => {
      const res = await getDashboardData(account!);
      return res.data as OffChainData;
    },
  });

  const referralCode = useMemo(() => (userId || offChainData?.userId || '').toUpperCase(), [userId, offChainData?.userId]);
  const referralLink = useMemo(() => `${window.location.origin}/register?ref=${referralCode}`, [referralCode]);

  const safeMoney = (val?: string) => {
    const n = parseFloat(val || '0');
    if (isNaN(n)) return '0.00';
    return n.toFixed(2);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccessToast('Copied to clipboard');
  };

  const handleUserPayout = async () => {
    if (!onChainData?.hasFundCode) {
      showErrorToast('Fund code not set. Please register with a fund code.');
      return;
    }
    const code = window.prompt('Enter your secret Fund Code');
    if (!code) return;
    setIsProcessing(true);
    try {
      const tx = await withdrawWithFundCode(code);
      if (tx?.wait) await tx.wait();
      showSuccessToast('Payout successful!');
      refetchOnChain();
    } catch (e) {
      showErrorToast(e, 'Payout failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAdminPayout = async () => {
    setIsProcessing(true);
    try {
      const tx = await withdrawCommission();
      if (tx?.wait) await tx.wait();
      showSuccessToast('Commission withdrawn');
      refetchOnChain();
    } catch (e) {
      showErrorToast(e, 'Commission withdrawal failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmergencyWithdraw = async () => {
    if (!onChainData || onChainData.role !== 'owner') return;
    if (!window.confirm('Withdraw all contract funds to owner wallet?')) return;
    setIsProcessing(true);
    try {
      const tx = await emergencyWithdrawAll();
      if (tx?.wait) await tx.wait();
      showSuccessToast('Emergency withdraw completed');
      refetchOnChain();
    } catch (e) {
      showErrorToast(e, 'Emergency withdraw failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncFromChain = async () => {
    if (!account) return;
    setIsProcessing(true);
    try {
      const { timestamp, signature } = await signAuthMessage(account);
      await upsertUserFromChain(account, timestamp, signature);
      showSuccessToast('Synced with backend');
      refetchOffChain();
    } catch (e) {
      showErrorToast(e, 'Sync failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkTodayLogin = async () => {
    if (!account) return;
    setIsProcessing(true);
    try {
      const { timestamp, signature } = await signAuthMessage(account);
      await api.post(`/api/users/${account}/login`, { timestamp, signature });
      showSuccessToast('Login counted for today');
      refetchOffChain();
    } catch (e) {
      showErrorToast(e, 'Unable to mark login');
    } finally {
      setIsProcessing(false);
    }
  };

  const [noticeForm, setNoticeForm] = useState({
    title: '',
    image_url: '',
    link_url: '',
    content_html: '',
    is_active: true,
    priority: 0,
  });
  const [adminOverview, setAdminOverview] = useState<{ total_users?: number; contract_balance?: string } | null>(null);

  const signAdminAction = async (purpose: string, address: string) => {
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const ts = Math.floor(Date.now() / 1000);
    const message = `Admin action authorization
Purpose: ${purpose}
Address: ${ethers.getAddress(address)}
Timestamp: ${ts}`;
    const signature = await signer.signMessage(message);
    return { timestamp: ts, signature, message };
  };

  const handleCreateNotice = async () => {
    if (!account || !onChainData || onChainData.role === 'user') {
      showErrorToast('Only admin/owner can post notices.');
      return;
    }
    setIsProcessing(true);
    try {
      const { timestamp, signature } = await signAdminAction('create_notice', account);
      await api.post('/api/notices', { address: account, timestamp, signature, ...noticeForm });
      showSuccessToast('Notice posted');
      setNoticeForm({ title: '', image_url: '', link_url: '', content_html: '', is_active: true, priority: 0 });
      refetchOffChain();
    } catch (e) {
      showErrorToast(e, 'Failed to post notice');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadAdminOverview = async () => {
    if (!account || !onChainData || onChainData.role === 'user') return;
    setIsProcessing(true);
    try {
      const { timestamp, signature } = await signAdminAction('admin_overview', account);
      const { data } = await api.post('/api/admin/overview', { address: account, timestamp, signature });
      const totalUsers = data?.totals?.total_registered_users ?? 0;
      const contractBalRaw = data?.totals?.contract_balance_raw ?? '0';
      const decimals = Number((config as any).usdtDecimals ?? 18);
      const pretty = Number(ethers.formatUnits(contractBalRaw, decimals)).toFixed(2);
      setAdminOverview({ total_users: totalUsers, contract_balance: pretty });
    } catch (e) {
      showErrorToast(e, 'Failed to load overview');
    } finally {
      setIsProcessing(false);
    }
  };

  const referralCode = useMemo(() => (userId || offChainData?.userId || '').toUpperCase(), [userId, offChainData?.userId]);
  const referralLink = useMemo(() => `${window.location.origin}/register?ref=${referralCode}`, [referralCode]);
  const initials = (referralCode || 'U').slice(0, 2).toUpperCase();

  const isMobile = useIsMobile();
  const btnFull = isMobile ? { width: '100%' } : {};
  const copyGrid = isMobile ? { gridTemplateColumns: '1fr' } : {};
  const noticeCardSize = isMobile ? { minWidth: '86%', maxWidth: '86%' } : {};

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={styles.brand}>Web3 Community</div>
          <div style={styles.userBox}>
            <div style={styles.avatar}>{initials}</div>
            <button style={{ ...styles.logoutBtn, ...(isMobile ? { width: 100 } : {}) }} onClick={() => { disconnect(); }}>
              Logout
            </button>
          </div>
        </div>

        <div style={styles.grid as any}>
          <div style={{ ...styles.card, ...styles.cardTall }}>
            <h3 style={styles.cardTitle}>Available Balance</h3>
            {isOnChainLoading ? (
              <div style={{ height: 28, background: '#eef2f6', borderRadius: 8 }} />
            ) : (
              <div style={styles.balance}>${safeMoney(onChainData?.userBalance)}</div>
            )}
            <div style={styles.row}>
              <button
                style={{ ...styles.button, ...btnFull }}
                disabled={isProcessing || isOnChainLoading}
                onClick={onChainData?.role === 'user' ? handleUserPayout : handleAdminPayout}
              >
                {onChainData?.role === 'user' ? 'Payout' : 'Withdraw Commission'}
              </button>
              <button style={{ ...styles.buttonGhost, ...btnFull }} disabled={isOnChainLoading} onClick={() => refetchOnChain()}>
                Refresh On‑chain
              </button>
              <button style={{ ...styles.buttonGhost, ...btnFull }} disabled={isOffChainLoading} onClick={() => refetchOffChain()}>
                Refresh Data
              </button>
            </div>
            {!isOnChainLoading && !onChainData?.hasFundCode && (
              <div style={{ ...styles.small, color: colors.danger, marginTop: 6 }}>
                Fund code not set. You must register with a fund code to withdraw.
              </div>
            )}
            {onChainData?.role !== 'user' && (
              <div style={{ marginTop: 8, ...styles.small }}>
                Contract Balance: <strong>${safeMoney(onChainData?.contractBalance)}</strong> • Your Commission: <strong>${safeMoney(onChainData?.adminCommission)}</strong>
              </div>
            )}
            {onChainData?.role === 'owner' && (
              <div style={{ marginTop: 8 }}>
                <button style={{ ...styles.buttonDanger, ...btnFull }} disabled={isProcessing} onClick={handleEmergencyWithdraw}>
                  Emergency Withdraw All
                </button>
              </div>
            )}
          </div>

          <div style={{ ...styles.card, ...styles.cardTall }}>
            <h3 style={styles.cardTitle}>Your Stats</h3>
            <div style={styles.statRow}>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Total Refer</div>
                <div style={styles.statValue}>
                  {isOffChainLoading ? '...' : (offChainData?.referralStats?.total_referrals ?? 0)}
                </div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Total Login (days)</div>
                <div style={styles.statValue}>
                  {isOffChainLoading ? '...' : (offChainData?.logins?.total_login_days ?? 0)}
                </div>
              </div>
            </div>
            <div style={{ ...styles.row, marginTop: 10 }}>
              <button style={{ ...styles.button, ...btnFull }} disabled={isProcessing || !account} onClick={handleMarkTodayLogin}>
                Mark Today’s Login
              </button>
              <button style={{ ...styles.buttonGhost, ...btnFull }} disabled={isProcessing || !account} onClick={handleSyncFromChain}>
                Sync Account (from chain)
              </button>
            </div>
            {!isOffChainLoading && offChainData?.commissions && (
              <>
                <div style={styles.divider} />
                <div style={styles.small}>
                  Commission estimate — L1: {offChainData.commissions.percentages.l1}% • L2: {offChainData.commissions.percentages.l2}% • L3: {offChainData.commissions.percentages.l3}%
                </div>
              </>
            )}
          </div>

          <div style={{ ...styles.card }}>
            <h3 style={styles.cardTitle}>Notice Board</h3>
            <div style={styles.noticeScroller}>
              {(offChainData?.notices ?? []).map((n) => (
                <div
                  key={n.id}
                  style={{ ...styles.noticeCard, ...noticeCardSize }}
                  onClick={() => {
                    if (n.link_url) window.open(n.link_url, '_blank');
                  }}
                  title={n.title}
                >
                  {n.image_url ? (
                    <img src={n.image_url} alt={n.title} style={styles.noticeImg as any} />
                  ) : (
                    <div style={styles.noticeImg as any} />
                  )}
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>{n.title}</div>
                  <div style={{ ...styles.small, ...styles.muted, marginBottom: 6 }}>{new Date(n.created_at).toLocaleString()}</div>
                  <div style={{ fontSize: 13, color: colors.navySoft, maxHeight: 120, overflow: 'auto' }}>
                    <DangerousHtml html={n.content_html} />
                  </div>
                </div>
              ))}
              {(!offChainData || (offChainData.notices || []).length === 0) && (
                <div style={{ ...styles.small, ...styles.muted }}>No notices yet.</div>
              )}
            </div>
          </div>

          <div style={{ ...styles.card }}>
            <h3 style={styles.cardTitle}>Share & Earn</h3>
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...styles.small, marginBottom: 6 }}>Referral Code</div>
              <div style={{ ...(styles.copyWrap as any), ...(copyGrid as any) }}>
                <input style={styles.input} readOnly value={referralCode || ''} />
                <button style={{ ...styles.button, ...btnFull }} onClick={() => copyToClipboard(referralCode)}>Copy</button>
              </div>
            </div>
            <div>
              <div style={{ ...styles.small, marginBottom: 6 }}>Referral Link</div>
              <div style={{ ...(styles.copyWrap as any), ...(copyGrid as any) }}>
                <input style={styles.input} readOnly value={referralLink} />
                <button style={{ ...styles.button, ...btnFull }} onClick={() => copyToClipboard(referralLink)}>Copy</button>
              </div>
            </div>
          </div>

          {(onChainData?.role === 'admin' || onChainData?.role === 'owner') && (
            <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
              <h3 style={styles.cardTitle}>Admin Panel</h3>

              <div style={styles.adminPanel as any}>
                <div style={styles.row}>
                  <button style={{ ...styles.buttonGhost, ...btnFull }} onClick={handleLoadAdminOverview} disabled={isProcessing}>
                    Load Overview
                  </button>
                  <span style={{ ...styles.small, alignSelf: 'center' }}>
                    {adminOverview
                      ? `Users: ${adminOverview.total_users ?? 0} • Contract: $${adminOverview.contract_balance ?? '0.00'}`
                      : '—'}
                  </span>
                </div>

                <div style={styles.divider} />

                <div style={styles.row}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ ...styles.small, marginBottom: 6 }}>Title</div>
                    <input
                      style={styles.input}
                      value={noticeForm.title}
                      onChange={(e) => setNoticeForm((s) => ({ ...s, title: e.target.value }))}
                      placeholder="Enter title"
                    />
                  </div>
                  <div style={{ width: 140, minWidth: 120 }}>
                    <div style={{ ...styles.small, marginBottom: 6 }}>Priority</div>
                    <input
                      type="number"
                      style={styles.input}
                      value={noticeForm.priority}
                      onChange={(e) => setNoticeForm((s) => ({ ...s, priority: Number(e.target.value) || 0 }))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div style={styles.row}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ ...styles.small, marginBottom: 6 }}>Image URL (optional)</div>
                    <input
                      style={styles.input}
                      value={noticeForm.image_url}
                      onChange={(e) => setNoticeForm((s) => ({ ...s, image_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ ...styles.small, marginBottom: 6 }}>Link URL (optional)</div>
                    <input
                      style={styles.input}
                      value={noticeForm.link_url}
                      onChange={(e) => setNoticeForm((s) => ({ ...s, link_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div>
                  <div style={{ ...styles.small, marginBottom: 6 }}>
                    Content HTML (supports scripts — use responsibly)
                  </div>
                  <textarea
                    style={styles.textarea as any}
                    value={noticeForm.content_html}
                    onChange={(e) => setNoticeForm((s) => ({ ...s, content_html: e.target.value }))}
                    placeholder="<div>Custom HTML here</div><script>console.log('Hi')</script>"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={noticeForm.is_active}
                      onChange={(e) => setNoticeForm((s) => ({ ...s, is_active: e.target.checked }))}
                    />
                    Active
                  </label>
                  <button style={{ ...styles.button, ...btnFull }} onClick={handleCreateNotice} disabled={isProcessing}>
                    Post Notice
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
