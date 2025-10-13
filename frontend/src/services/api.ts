// frontend/src/services/api.ts
import axios from 'axios';
import { config } from '../config';

const api = axios.create({
  baseURL: config.apiBaseUrl,
});

// Existing
export const getUserBootstrap = (address: string) =>
  api.get(`/api/users/${address}`);

export const upsertUserFromChain = (address: string, timestamp: number, signature: string) =>
  api.post('/api/users/upsert-from-chain', { address, timestamp, signature });

export const getDashboardData = (walletAddress: string) =>
  api.get(`/api/dashboard/${walletAddress}`);

// New: daily login mark
export const markLogin = (address: string, timestamp: number, signature: string) =>
  api.post(`/api/users/${address}/login`, { timestamp, signature });

// Notices
type NoticePayload = {
  address: string;
  timestamp: number;
  signature: string;
  title?: string;
  content_html?: string;
  image_url?: string;
  link_url?: string;
  is_active?: boolean;
  priority?: number;
};

export const createNotice = (payload: NoticePayload) =>
  api.post('/api/notices', payload);

export const updateNotice = (id: number, payload: NoticePayload) =>
  api.patch(`/api/notices/${id}`, payload);

export const getNotices = (params?: { limit?: number; active?: 0 | 1 }) =>
  api.get('/api/notices', { params });

// Admin overview
export const adminOverview = (address: string, timestamp: number, signature: string) =>
  api.post('/api/admin/overview', { address, timestamp, signature });

export { api };
