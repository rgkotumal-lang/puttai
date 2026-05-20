import { PuttData, ShotResult } from './types'

const PUTTS_KEY = 'puttai_putts'
const RESULTS_KEY = 'puttai_results'

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function savePutt(putt: PuttData): void {
  if (typeof window === 'undefined') return
  const putts = getAllPutts()
  putts.push(putt)
  localStorage.setItem(PUTTS_KEY, JSON.stringify(putts))
}

export function saveShotResult(result: ShotResult): void {
  if (typeof window === 'undefined') return
  const results = getAllResults()
  results.push(result)
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results))
}

export function getAllPutts(): PuttData[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(PUTTS_KEY) || '[]')
  } catch {
    return []
  }
}

export function getAllResults(): ShotResult[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY) || '[]')
  } catch {
    return []
  }
}

export function getLastPutt(): PuttData | null {
  const putts = getAllPutts()
  return putts.length > 0 ? putts[putts.length - 1] : null
}

export function getLastResult(): ShotResult | null {
  const results = getAllResults()
  return results.length > 0 ? results[results.length - 1] : null
}

export function clearAllData(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(PUTTS_KEY)
  localStorage.removeItem(RESULTS_KEY)
}
