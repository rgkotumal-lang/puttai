import { PuttData, ShotResult, SessionStats } from './types'

const VIEWFINDER_FEET = 20
const VIEWFINDER_WIDTH_FEET = 6

export function calcDistance(
  ballX: number,
  ballY: number,
  holeX: number,
  holeY: number
): number {
  const dx = (ballX - holeX) * VIEWFINDER_FEET
  const dy = (ballY - holeY) * VIEWFINDER_FEET
  return Math.sqrt(dx * dx + dy * dy)
}

export function calcAimOffset(
  direction: 'left' | 'right' | 'straight',
  intensity: number
): number {
  if (direction === 'straight') return 0
  const offsets = [1.5, 3, 5, 6.5, 8]
  const inches = offsets[Math.min(Math.max(intensity - 1, 0), 4)]
  return direction === 'left' ? inches : -inches
}

export function speedLabel(stimp: number): string {
  if (stimp <= 7) return 'Slow'
  if (stimp <= 9) return 'Medium'
  if (stimp <= 11) return 'Medium-fast'
  if (stimp <= 13) return 'Fast'
  return 'Tour fast'
}

export function calcMissDistance(
  targetX: number,
  targetY: number,
  actualX: number,
  actualY: number
): number {
  const dx = (actualX - targetX) * VIEWFINDER_WIDTH_FEET * 12
  const dy = (actualY - targetY) * VIEWFINDER_WIDTH_FEET * 12
  return Math.sqrt(dx * dx + dy * dy)
}

export function calcMissDirection(
  targetX: number,
  targetY: number,
  actualX: number,
  actualY: number,
  _breakDirection: 'left' | 'right' | 'straight'
): 'left' | 'right' | 'long' | 'short' | 'made' {
  const missInches = calcMissDistance(targetX, targetY, actualX, actualY)
  if (missInches < 3) return 'made'

  const dx = actualX - targetX
  const dy = actualY - targetY

  if (Math.abs(dy) > Math.abs(dx)) {
    return dy < 0 ? 'long' : 'short'
  }
  return dx < 0 ? 'left' : 'right'
}

export function computeStats(putts: PuttData[], results: ShotResult[]): SessionStats {
  const totalPutts = putts.length
  const madeCount = results.filter(r => r.missDirection === 'made').length
  const makeRate = totalPutts > 0 ? madeCount / Math.max(results.length, 1) : 0

  const missDistances = results.map(r => r.missDistanceInches)
  const avgMissDistanceInches =
    missDistances.length > 0
      ? missDistances.reduce((a, b) => a + b, 0) / missDistances.length
      : 0

  const distanceBuckets = [3, 4, 6, 8, 10, 15, 20]
  const makeRateByDistance = distanceBuckets.map(dist => {
    const range = dist === 20 ? [15, Infinity] : [dist - 1, dist + 1]
    const inRange = putts.filter(p => p.distance >= range[0] && p.distance <= range[1])
    if (inRange.length === 0) return { distance: dist, rate: 0 }
    const mades = inRange.filter(p => {
      const r = results.find(r => r.puttId === p.id)
      return r?.missDirection === 'made'
    })
    return { distance: dist, rate: mades.length / inRange.length }
  })

  const missDirCounts: Record<string, number> = {}
  results.forEach(r => {
    if (r.missDirection !== 'made') {
      missDirCounts[r.missDirection] = (missDirCounts[r.missDirection] || 0) + 1
    }
  })
  const dominantMissDirection =
    Object.entries(missDirCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none'

  const now = Date.now()
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000

  const thisWeekResults = results.filter(r => {
    const p = putts.find(p => p.id === r.puttId)
    return p && p.timestamp >= oneWeekAgo
  })
  const lastWeekResults = results.filter(r => {
    const p = putts.find(p => p.id === r.puttId)
    return p && p.timestamp >= twoWeeksAgo && p.timestamp < oneWeekAgo
  })

  const thisWeekRate =
    thisWeekResults.length > 0
      ? thisWeekResults.filter(r => r.missDirection === 'made').length / thisWeekResults.length
      : 0
  const lastWeekRate =
    lastWeekResults.length > 0
      ? lastWeekResults.filter(r => r.missDirection === 'made').length / lastWeekResults.length
      : 0

  const weekOverWeekChange = (thisWeekRate - lastWeekRate) * 100

  const missPoints = results.map(r => ({
    x: r.actualX,
    y: r.actualY,
    made: r.missDirection === 'made',
  }))

  return {
    totalPutts,
    madeCount,
    makeRate,
    avgPuttsPerHole: 1.8,
    avgMissDistanceInches,
    makeRateByDistance,
    dominantMissDirection,
    weekOverWeekChange,
    missPoints,
  }
}
