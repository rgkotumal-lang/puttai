export interface PuttData {
  id: string
  timestamp: number
  holeNumber?: number
  distance: number
  breakDirection: 'left' | 'right' | 'straight'
  breakIntensity: number
  greenSpeed: number
  aimOffsetInches: number
  targetX: number
  targetY: number
  ballX: number
  ballY: number
}

export interface ShotResult {
  puttId: string
  actualX: number
  actualY: number
  missDistanceInches: number
  missDirection: 'left' | 'right' | 'long' | 'short' | 'made'
  tips: CoachingTip[]
}

export interface CoachingTip {
  id: string
  type: 'error' | 'warning' | 'success' | 'info'
  title: string
  body: string
}

export interface SessionStats {
  totalPutts: number
  madeCount: number
  makeRate: number
  avgPuttsPerHole: number
  avgMissDistanceInches: number
  makeRateByDistance: { distance: number; rate: number }[]
  dominantMissDirection: string
  weekOverWeekChange: number
  missPoints: { x: number; y: number; made: boolean }[]
}
