// frontend/src/utils/notification.ts
import toast from 'react-hot-toast';

// Extract a human-readable error message from various sources (Ethers, Axios, generic)
function extractErrorMessage(err: any): string {
  if (!err) return 'Something went wrong';

  // Direct string
  if (typeof err === 'string') return err;

  // Axios style
  const axiosMsg =
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.response?.data ||
    err?.message;
  if (axiosMsg && typeof axiosMsg === 'string') return axiosMsg;

  // Ethers v6 style
  const ethersFields = err?.shortMessage || err?.reason || err?.message || err?.info?.error?.message;
  if (ethersFields && typeof ethersFields === 'string') {
    // Common wallet rejections
    if (/user rejected|rejected the request/i.test(ethersFields)) {
      return 'Request rejected in wallet.';
    }
    return ethersFields;
  }

  // EIP-1193 codes
  if (typeof err?.code !== 'undefined') {
    if (err.code === 4001) return 'Request rejected in wallet.'; // user rejected
    if (err.code === -32603) return 'Internal JSON-RPC error.';
  }

  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

export function showSuccessToast(message: string) {
  toast.success(message);
}

export function showErrorToast(error: any, fallback?: string) {
  const msg = extractErrorMessage(error) || fallback || 'Something went wrong';
  toast.error(msg);
}