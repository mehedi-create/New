// backend/src/utils/auth.ts
import { ethers } from 'ethers'
import type { Bindings } from './types'
import { getContract, getProvider } from './chain'

export function buildUserAuthMessage(address: string, timestamp: number) {
  return `I authorize the backend to sync my on-chain profile.
Address: ${ethers.getAddress(address)}
Timestamp: ${timestamp}`
}

export function buildAdminActionMessage(purpose: string, address: string, timestamp: number) {
  return `Admin action authorization
Purpose: ${purpose}
Address: ${ethers.getAddress(address)}
Timestamp: ${Number(timestamp)}`
}

export async function verifySignedMessage(expectedAddress: string, message: string, signature: string) {
  let recovered: string
  try { recovered = ethers.verifyMessage(message, signature) } catch { throw new Error('Invalid signature') }
  if (ethers.getAddress(recovered) !== ethers.getAddress(expectedAddress)) {
    throw new Error('Signature does not match address')
  }
}

export async function requireOwner(env: Bindings, address: string) {
  const provider = getProvider(env)
  const contract = getContract(env, provider)
  const owner = await (contract as any).owner()
  if (ethers.getAddress(owner) !== ethers.getAddress(address)) {
    throw new Error('Not authorized: only contract owner allowed')
  }
}
