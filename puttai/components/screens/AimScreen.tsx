'use client'

import { useState, useEffect } from 'react'
import CameraViewfinder from '@/components/ui/CameraViewfinder'
import { calcDistance, calcAimOffset, speedLabel } from '@/lib/calculations'
import { savePutt, generateId, getAllPutts } from '@/lib/storage'

const HOLE = { x: 0.447, y: 0.147 }

interface AimScreenProps {
  onNavigateToReview: () => void
}

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
}

const intensityLabels = ['Subtle', 'Gentle', 'Medium', 'Strong', 'Sharp']

export default function AimScreen({ onNavigateToReview }: AimScreenProps) {
  const [ballPosition, setBallPosition] = useState({ x: 0.5, y: 0.78 })
  const [greenSpeed, setGreenSpeed] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('puttai_default_stimp') ?? '10.5')
    }
    return 10.5
  })
  const [breakDirection, setBreakDirection] = useState<'left' | 'right' | 'straight'>('left')
  const [breakIntensity, setBreakIntensity] = useState(3)
  const [saving, setSaving] = useState(false)

  const distance = calcDistance(ballPosition.x, ballPosition.y)
  const aimOffsetInches = calcAimOffset(breakDirection, breakIntensity)
  const speed = speedLabel(greenSpeed)
  const confidence = Math.min(97, 75 + breakIntensity * 3 + (greenSpeed > 10 ? 5 : 0))

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('puttai_default_stimp', String(greenSpeed))
    }
  }, [greenSpeed])

  function handleShot() {
    haptic()
    setSaving(true)
    const putt = {
      id: generateId(),
      timestamp: Date.now(),
      holeNumber: getAllPutts().length + 1,
      distance,
      breakDirection,
      breakIntensity,
      greenSpeed,
      aimOffsetInches,
      targetX: HOLE.x,
      targetY: HOLE.y,
      ballX: ballPosition.x,
      ballY: ballPosition.y,
    }
    savePutt(putt)
    setSaving(false)
    onNavigateToReview()
  }

  function handleReset() {
    setBallPosition({ x: 0.5, y: 0.78 })
    setBreakDirection('left')
    setBreakIntensity(3)
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      <CameraViewfinder
        breakDirection={breakDirection}
        breakIntensity={breakIntensity}
        greenSpeed={greenSpeed}
        onBallPositionChange={setBallPosition}
      />

      <p className="text-center text-[11px] text-green-500">Tap viewfinder to reposition ball</p>

      {/* Green speed */}
      <div className="bg-green-900 rounded-xl px-4 py-3">
        <div className="flex justify-between items-center mb-2">
          <label className="text-[12px] text-green-400 uppercase tracking-wider">Green speed (stimp)</label>
          <span className="text-sm font-bold text-green-300">
            {greenSpeed.toFixed(1)} — {speed}
          </span>
        </div>
        <input
          type="range"
          min={6}
          max={14}
          step={0.5}
          value={greenSpeed}
          onChange={e => setGreenSpeed(Number(e.target.value))}
          className="w-full accent-green-500"
        />
      </div>

      {/* Break direction */}
      <div className="bg-green-900 rounded-xl px-4 py-3">
        <label className="text-[12px] text-green-400 uppercase tracking-wider block mb-2">
          Break direction
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['left', 'straight', 'right'] as const).map(dir => (
            <button
              key={dir}
              onClick={() => { setBreakDirection(dir); haptic() }}
              className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                breakDirection === dir
                  ? 'bg-green-600 text-white'
                  : 'bg-green-800 text-green-300'
              }`}
            >
              {dir === 'left' ? '↙ Left' : dir === 'straight' ? '→ Straight' : '↘ Right'}
            </button>
          ))}
        </div>
      </div>

      {/* Break intensity */}
      <div className="bg-green-900 rounded-xl px-4 py-3">
        <div className="flex justify-between items-center mb-2">
          <label className="text-[12px] text-green-400 uppercase tracking-wider">
            Break intensity
          </label>
          <span className="text-sm font-bold text-green-300">
            {intensityLabels[breakIntensity - 1]}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={breakIntensity}
          onChange={e => setBreakIntensity(Number(e.target.value))}
          className="w-full accent-green-500"
        />
        <div className="flex justify-between mt-1">
          {intensityLabels.map(l => (
            <span key={l} className="text-[9px] text-green-600">{l}</span>
          ))}
        </div>
      </div>

      {/* Analysis panel */}
      <div className="bg-green-900 rounded-xl px-4 py-3">
        <h3 className="text-[11px] text-green-500 uppercase tracking-wider mb-2">Analysis</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Row label="Distance" value={`${distance.toFixed(1)} ft`} />
          <Row
            label="Aim point"
            value={
              aimOffsetInches === 0
                ? 'Center cup'
                : `${Math.abs(aimOffsetInches).toFixed(1)}" ${aimOffsetInches > 0 ? 'left' : 'right'}`
            }
          />
          <Row
            label="Slope"
            value={
              breakDirection === 'straight'
                ? 'Flat'
                : `${intensityLabels[breakIntensity - 1]} ${breakDirection}`
            }
          />
          <Row label="Confidence" value={`${confidence}%`} highlight />
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={handleShot}
        disabled={saving}
        className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold text-base transition-colors disabled:opacity-60"
        style={{ minHeight: 44 }}
      >
        {saving ? 'Saving…' : '📸 Shot taken — analyze result'}
      </button>

      <button
        onClick={handleReset}
        className="w-full py-3 rounded-xl border border-green-700 text-green-400 text-sm font-semibold hover:bg-green-900 active:bg-green-800 transition-colors"
        style={{ minHeight: 44 }}
      >
        ↺ Reset
      </button>
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <>
      <span className="text-[12px] text-green-500">{label}</span>
      <span className={`text-[13px] font-semibold ${highlight ? 'text-gold' : 'text-green-300'}`}>
        {value}
      </span>
    </>
  )
}
