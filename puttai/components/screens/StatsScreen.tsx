'use client'

import { useEffect, useState } from 'react'
import StatCard from '@/components/ui/StatCard'
import BarChart from '@/components/ui/BarChart'
import MissPattern from '@/components/ui/MissPattern'
import ProBanner from '@/components/ui/ProBanner'
import { getAllPutts, getAllResults } from '@/lib/storage'
import { computeStats } from '@/lib/calculations'
import { SessionStats } from '@/lib/types'

export default function StatsScreen() {
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const putts = getAllPutts()
    const results = getAllResults()
    setStats(computeStats(putts, results))
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
        <div className="skeleton h-36 rounded-xl" />
        <div className="skeleton h-36 rounded-xl" />
      </div>
    )
  }

  if (!stats || stats.totalPutts < 3) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <span className="text-5xl">⛳</span>
        <h2 className="text-green-300 font-bold text-lg">Log 3+ putts to see your stats</h2>
        <p className="text-green-500 text-sm max-w-xs">
          Head to the Aim tab, set up your putt, and hit the shot button. Your progress will appear here.
        </p>
        {stats && stats.totalPutts > 0 && (
          <p className="text-green-600 text-xs">
            {stats.totalPutts} putt{stats.totalPutts > 1 ? 's' : ''} logged so far
          </p>
        )}
      </div>
    )
  }

  const wowSign = stats.weekOverWeekChange >= 0 ? '+' : ''
  const wowTrend = stats.weekOverWeekChange > 0 ? 'up' : stats.weekOverWeekChange < 0 ? 'down' : 'neutral'

  return (
    <div className="flex flex-col gap-4 pb-2">
      <h2 className="text-lg font-bold text-green-300">Your Stats</h2>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Make rate (8 ft)"
          value={`${Math.round(stats.makeRate * 100)}%`}
          sub={`${stats.madeCount} of ${stats.totalPutts} putts`}
        />
        <StatCard
          label="Avg putts / hole"
          value={stats.avgPuttsPerHole.toFixed(1)}
          sub="Estimated"
        />
        <StatCard
          label="Week over week"
          value={`${wowSign}${stats.weekOverWeekChange.toFixed(1)}%`}
          sub="Make rate change"
          trend={wowTrend}
        />
        <StatCard
          label="Avg miss"
          value={`${stats.avgMissDistanceInches.toFixed(1)}"`}
          sub="from cup"
        />
      </div>

      <BarChart data={stats.makeRateByDistance} />

      <MissPattern
        points={stats.missPoints}
        dominantMiss={stats.dominantMissDirection}
      />

      <ProBanner />
    </div>
  )
}
