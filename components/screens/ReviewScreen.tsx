'use client'

import { useState, useRef } from 'react'
import TipCard from '@/components/ui/TipCard'
import { getLastPutt, saveShotResult, getAllResults, getAllPutts } from '@/lib/storage'
import { calcMissDistance, calcMissDirection, speedLabel } from '@/lib/calculations'
import { CoachingTip, PuttData, ShotResult } from '@/lib/types'

interface ReviewScreenProps {
  onNavigateToAim: () => void
}

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
}

export default function ReviewScreen({ onNavigateToAim }: ReviewScreenProps) {
  const [actualPos, setActualPos] = useState<{ x: number; y: number } | null>(null)
  const [phase, setPhase] = useState<'place' | 'loading' | 'result'>('place')
  const [result, setResult] = useState<ShotResult | null>(null)
  const [offlineMode, setOfflineMode] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const putt = getLastPutt()

  // Use hole position from putt data (user-tapped, dynamic)
  const holeX = putt?.targetX ?? 0.447
  const holeY = putt?.targetY ?? 0.147

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    setActualPos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    })
    haptic()
  }

  function handleSvgTouch(e: React.TouchEvent<SVGSVGElement>) {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const touch = e.changedTouches[0]
    const rect = svg.getBoundingClientRect()
    setActualPos({
      x: (touch.clientX - rect.left) / rect.width,
      y: (touch.clientY - rect.top) / rect.height,
    })
    haptic()
  }

  async function handleConfirm() {
    if (!actualPos || !putt) return
    haptic()
    setPhase('loading')

    const missDistanceInches = calcMissDistance(holeX, holeY, actualPos.x, actualPos.y)
    const missDirection = calcMissDirection(holeX, holeY, actualPos.x, actualPos.y, putt.breakDirection)

    const newResult: ShotResult = {
      puttId: putt.id,
      actualX: actualPos.x,
      actualY: actualPos.y,
      missDistanceInches,
      missDirection,
      tips: [],
    }

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ putt, result: newResult }),
      })
      const data = await res.json()
      newResult.tips = (data.tips as CoachingTip[]).map((t, i) => ({
        ...t,
        id: t.id ?? String(i + 1),
      }))
      if (data.error) setOfflineMode(true)
    } catch {
      setOfflineMode(true)
      newResult.tips = [
        {
          id: '1',
          type: 'info',
          title: 'Offline mode',
          body: 'AI analysis unavailable. Check your connection and try again on your next putt.',
        },
      ]
    }

    saveShotResult(newResult)
    setResult(newResult)
    setPhase('result')
    haptic()
  }

  function handleNextPutt() {
    haptic()
    setPhase('place')
    setActualPos(null)
    setResult(null)
    setOfflineMode(false)
    onNavigateToAim()
  }

  const allPutts = getAllPutts()
  const allResults = getAllResults()
  const puttNumber = allResults.length

  // ——— Placement phase ———
  if (phase === 'place') {
    const W = 280
    const H = 220
    const hx = holeX * W
    const hy = holeY * H + 20
    const bx = putt ? putt.ballX * W : W * 0.5
    const by = putt ? putt.ballY * H : H * 0.8
    const cpx = putt
      ? (bx + hx) / 2 + (putt.breakDirection === 'left' ? -putt.breakIntensity * 10 : putt.breakDirection === 'right' ? putt.breakIntensity * 10 : 0)
      : (bx + hx) / 2
    const cpy = (by + hy) / 2
    const ax = actualPos ? actualPos.x * W : null
    const ay = actualPos ? actualPos.y * H + 20 : null

    return (
      <div className="flex flex-col gap-4 pb-2">
        <div>
          <h2 className="text-lg font-bold text-green-300">Place your ball</h2>
          <p className="text-[12px] text-green-500">Tap the green to mark where your ball ended up</p>
        </div>

        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full rounded-xl bg-green-800 cursor-crosshair"
          onClick={handleSvgClick}
          onTouchEnd={handleSvgTouch}
          style={{ touchAction: 'none' }}
        >
          <rect width={W} height={H} fill="#1a3a1a" rx={12} />
          {[1, 2, 3, 4].map(i => (
            <g key={i}>
              <line x1={(W / 5) * i} y1={0} x2={(W / 5) * i} y2={H} stroke="#2d5a2d" strokeWidth={0.5} />
              <line x1={0} y1={(H / 5) * i} x2={W} y2={(H / 5) * i} stroke="#2d5a2d" strokeWidth={0.5} />
            </g>
          ))}
          <path
            d={`M ${bx} ${by} Q ${cpx} ${cpy} ${hx} ${hy}`}
            fill="none" stroke="rgba(76,175,80,0.5)" strokeWidth={1.5} strokeDasharray="6 4"
          />
          <circle cx={hx} cy={hy} r={8} fill="#111" stroke="white" strokeWidth={1.5} />
          <line x1={hx} y1={hy - 8} x2={hx} y2={hy - 28} stroke="white" strokeWidth={1.5} />
          <polygon points={`${hx},${hy - 28} ${hx + 10},${hy - 22} ${hx},${hy - 16}`} fill="#ef4444" />
          {ax !== null && ay !== null && (
            <circle cx={ax} cy={ay} r={7} fill="#ffb74d" stroke="#fff" strokeWidth={1.5} />
          )}
          <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#4caf50" opacity={0.6}>
            {actualPos ? 'Tap to reposition' : 'Tap to place ball'}
          </text>
        </svg>

        <button
          onClick={handleConfirm}
          disabled={!actualPos}
          className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold text-base transition-colors disabled:opacity-40"
          style={{ minHeight: 44 }}
        >
          Confirm result
        </button>
      </div>
    )
  }

  // ——— Loading phase ———
  if (phase === 'loading') {
    return (
      <div className="flex flex-col gap-4 pb-2">
        <h2 className="text-lg font-bold text-green-300">Analyzing shot…</h2>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
        <div className="skeleton h-6 w-1/2 rounded" />
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-green-400 text-sm">Getting AI recommendations…</span>
        </div>
      </div>
    )
  }

  // ——— Result phase ———
  if (!result || !putt) return null

  const W = 120
  const H = 100
  const hx = holeX * W
  const hy = holeY * H + 10
  const bx = putt.ballX * W
  const by = putt.ballY * H
  const ax = result.actualX * W
  const ay = result.actualY * H + 10
  const made = result.missDirection === 'made'

  return (
    <div className="flex flex-col gap-4 pb-2 screen-enter">
      <div>
        <h2 className="text-lg font-bold text-green-300">Shot Analysis</h2>
        <p className="text-[12px] text-green-500">
          Putt #{puttNumber} · {putt.distance.toFixed(1)} ft
        </p>
        {offlineMode && (
          <span className="text-[10px] bg-green-800 text-green-400 px-2 py-0.5 rounded-full">
            Offline mode
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MiniGreen
          label="Target line"
          hx={hx} hy={hy} bx={bx} by={by}
          showTarget breakDir={putt.breakDirection} breakInt={putt.breakIntensity}
          W={W} H={H}
        />
        <MiniGreen
          label="Actual result"
          hx={hx} hy={hy} bx={bx} by={by}
          ax={ax} ay={ay} made={made}
          W={W} H={H}
        />
      </div>

      <div className={`rounded-xl px-4 py-3 text-center ${made ? 'bg-green-800' : 'bg-green-900 border border-green-700'}`}>
        {made ? (
          <span className="text-green-300 font-bold text-lg">🎯 Made it!</span>
        ) : (
          <span className="text-green-200 font-semibold text-base">
            Missed by <span className="text-gold">{result.missDistanceInches.toFixed(1)}"</span>
            {' '}<span className="capitalize text-green-400">{result.missDirection}</span>
          </span>
        )}
      </div>

      {/* Putt conditions summary */}
      <div className="bg-green-900 rounded-xl px-4 py-3">
        <h3 className="text-[11px] text-green-500 uppercase tracking-wider mb-2">Putt conditions</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <span className="text-[12px] text-green-500">Distance</span>
          <span className="text-[13px] font-semibold text-green-300">{putt.distance.toFixed(1)} ft</span>
          <span className="text-[12px] text-green-500">Green speed (AI)</span>
          <span className="text-[13px] font-semibold text-green-300">
            {putt.greenSpeed} — {speedLabel(putt.greenSpeed)}
          </span>
          {putt.confirmedGreenSpeed !== undefined && (
            <>
              <span className="text-[12px] text-green-500">Confirmed stimp</span>
              <span className="text-[13px] font-semibold text-green-300">{putt.confirmedGreenSpeed}</span>
            </>
          )}
          <span className="text-[12px] text-green-500">Slope</span>
          <span className="text-[13px] font-semibold text-green-300 capitalize">{putt.slope}</span>
          {putt.slopeDegrees !== undefined && (
            <>
              <span className="text-[12px] text-green-500">Along tilt</span>
              <span className="text-[13px] font-semibold text-green-300">
                {putt.slopeDegrees > 0 ? '+' : ''}{putt.slopeDegrees.toFixed(1)}°
              </span>
            </>
          )}
          {putt.crossSlopeDegrees !== undefined && (
            <>
              <span className="text-[12px] text-green-500">Cross tilt</span>
              <span className="text-[13px] font-semibold text-green-300">
                {putt.crossSlopeDegrees > 0 ? '+' : ''}{putt.crossSlopeDegrees.toFixed(1)}°
              </span>
            </>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-[12px] text-green-400 uppercase tracking-wider mb-2">AI Recommendations</h3>
        {result.tips.map(tip => <TipCard key={tip.id} tip={tip} />)}
      </div>

      {/* Session putt history */}
      {allPutts.length > 1 && (
        <div className="bg-green-900 rounded-xl px-4 py-3">
          <h3 className="text-[11px] text-green-500 uppercase tracking-wider mb-2">
            Session history ({allPutts.length} putts)
          </h3>
          <div className="flex flex-col gap-1.5">
            {[...allPutts].reverse().map((p, i) => {
              const r = allResults.find(r => r.puttId === p.id)
              const made = r?.missDirection === 'made'
              const isCurrent = p.id === putt.id
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between py-1.5 px-2 rounded-lg ${isCurrent ? 'bg-green-800' : 'bg-green-950'}`}
                >
                  <span className="text-[11px] text-green-500">#{allPutts.length - i}</span>
                  <span className="text-[12px] text-green-300">{p.distance.toFixed(1)} ft</span>
                  <span className="text-[11px] text-green-400 capitalize">{p.breakDirection}</span>
                  {r ? (
                    <span className={`text-[11px] font-semibold ${made ? 'text-green-400' : 'text-amber-400'}`}>
                      {made ? 'Made' : `${r.missDistanceInches.toFixed(0)}" ${r.missDirection}`}
                    </span>
                  ) : (
                    <span className="text-[11px] text-green-700">pending</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <button
        onClick={handleNextPutt}
        className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold text-base transition-colors"
        style={{ minHeight: 44 }}
      >
        📸 Next putt
      </button>
    </div>
  )
}

function MiniGreen({ label, hx, hy, bx, by, ax, ay, made, showTarget, breakDir, breakInt, W, H }: {
  label: string; hx: number; hy: number; bx: number; by: number
  ax?: number; ay?: number; made?: boolean; showTarget?: boolean
  breakDir?: string; breakInt?: number; W: number; H: number
}) {
  const cpx = showTarget
    ? (bx + hx) / 2 + (breakDir === 'left' ? -(breakInt ?? 3) * 6 : breakDir === 'right' ? (breakInt ?? 3) * 6 : 0)
    : (bx + hx) / 2
  const cpy = (by + hy) / 2

  return (
    <div className="bg-green-900 rounded-xl p-2">
      <p className="text-[10px] text-green-500 mb-1.5">{label}</p>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <rect width={W} height={H} fill="#1a3a1a" rx={6} />
        {showTarget ? (
          <path d={`M ${bx} ${by} Q ${cpx} ${cpy} ${hx} ${hy}`}
            fill="none" stroke="rgba(76,175,80,0.7)" strokeWidth={1.5} strokeDasharray="4 3" />
        ) : (
          ax !== undefined && ay !== undefined && (
            <line x1={bx} y1={by} x2={ax} y2={ay}
              stroke={made ? '#4caf50' : '#ffb74d'} strokeWidth={1.5} strokeDasharray="3 2" />
          )
        )}
        <circle cx={hx} cy={hy} r={5} fill="#111" stroke="white" strokeWidth={1} />
        <line x1={hx} y1={hy - 5} x2={hx} y2={hy - 18} stroke="white" strokeWidth={1} />
        <polygon points={`${hx},${hy - 18} ${hx + 7},${hy - 13} ${hx},${hy - 8}`} fill="#ef4444" />
        {showTarget ? (
          <circle cx={bx} cy={by} r={4} fill="white" stroke="#333" strokeWidth={1} />
        ) : (
          ax !== undefined && ay !== undefined && (
            <circle cx={ax} cy={ay} r={4} fill={made ? '#4caf50' : '#ffb74d'} stroke="white" strokeWidth={1} />
          )
        )}
      </svg>
    </div>
  )
}
