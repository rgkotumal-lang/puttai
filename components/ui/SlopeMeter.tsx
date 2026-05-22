'use client'

import { useState, useEffect, useRef } from 'react'

export interface SlopeReading {
  slopeDegrees: number       // along-putt tilt (negative = uphill toward hole)
  crossSlopeDegrees: number  // left-right tilt (negative = left lower = left break)
}

interface SlopeMeterProps {
  onMeasured: (reading: SlopeReading) => void
  onSkip: () => void
}

type State = 'idle' | 'waiting_permission' | 'measuring' | 'locked' | 'unavailable'

const SAMPLE_COUNT = 20   // average over this many readings for stability

export default function SlopeMeter({ onMeasured, onSkip }: SlopeMeterProps) {
  const [state, setState] = useState<State>('idle')
  const [beta, setBeta] = useState(0)
  const [gamma, setGamma] = useState(0)
  const samplesRef = useRef<{ beta: number; gamma: number }[]>([])

  // Clean up listener on unmount
  useEffect(() => {
    return () => { window.removeEventListener('deviceorientation', handleOrientation) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleOrientation(e: DeviceOrientationEvent) {
    const b = e.beta ?? 0
    const g = e.gamma ?? 0
    setBeta(b)
    setGamma(g)
    samplesRef.current.push({ beta: b, gamma: g })
    if (samplesRef.current.length > SAMPLE_COUNT) samplesRef.current.shift()
  }

  async function startMeasuring() {
    setState('waiting_permission')
    // iOS 13+ requires explicit permission from a user gesture
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perm = await (DeviceOrientationEvent as any).requestPermission()
        if (perm !== 'granted') { setState('unavailable'); return }
      } catch {
        setState('unavailable'); return
      }
    }

    // Check if DeviceOrientationEvent fires at all (desktop returns null values)
    let gotReading = false
    const checker = (e: DeviceOrientationEvent) => {
      if (e.beta !== null) gotReading = true
    }
    window.addEventListener('deviceorientation', checker, { once: true })
    setTimeout(() => {
      window.removeEventListener('deviceorientation', checker)
      if (!gotReading) { setState('unavailable'); return }
    }, 1500)

    samplesRef.current = []
    window.addEventListener('deviceorientation', handleOrientation)
    setState('measuring')
  }

  function lockReading() {
    window.removeEventListener('deviceorientation', handleOrientation)
    const s = samplesRef.current
    if (s.length === 0) { onSkip(); return }
    const avgBeta  = s.reduce((a, b) => a + b.beta,  0) / s.length
    const avgGamma = s.reduce((a, b) => a + b.gamma, 0) / s.length
    setState('locked')
    onMeasured({
      slopeDegrees:      parseFloat(avgBeta.toFixed(1)),
      crossSlopeDegrees: parseFloat(avgGamma.toFixed(1)),
    })
  }

  // ——— Visual helpers ———

  // Interpret slope direction for display
  function slopeLabel(b: number, g: number) {
    const along = Math.abs(b) < 1.5 ? null : b < 0 ? 'Uphill' : 'Downhill'
    const cross  = Math.abs(g) < 1.5 ? null : g < 0 ? 'Left break' : 'Right break'
    if (!along && !cross) return 'Flat'
    return [along, cross].filter(Boolean).join(' · ')
  }

  // Total tilt magnitude for the dial
  const totalDeg = Math.min(Math.sqrt(beta * beta + gamma * gamma), 20).toFixed(1)

  // Bubble position on level indicator (clamped ±30px)
  const bubbleX = Math.max(-28, Math.min(28, (gamma / 10) * 28))
  const bubbleY = Math.max(-28, Math.min(28, (beta  / 10) * 28))

  return (
    <div className="bg-green-900 rounded-2xl px-5 py-5 flex flex-col gap-4">
      <div className="text-center">
        <h3 className="text-white font-bold text-base">Measure green slope</h3>
        <p className="text-green-400 text-xs mt-1">
          Place your phone flat on the green, top edge pointing toward the hole
        </p>
      </div>

      {state === 'idle' && (
        <div className="flex flex-col gap-2">
          <button
            onClick={startMeasuring}
            className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"
            style={{ minHeight: 44 }}
          >
            📐 Start measuring
          </button>
          <button
            onClick={onSkip}
            className="w-full py-2 text-green-500 text-sm"
          >
            Skip — use AI estimate
          </button>
        </div>
      )}

      {state === 'waiting_permission' && (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-green-400 text-sm">Requesting sensor access…</span>
        </div>
      )}

      {state === 'unavailable' && (
        <div className="text-center">
          <p className="text-green-500 text-sm mb-3">
            Motion sensor unavailable on this device
          </p>
          <button onClick={onSkip} className="w-full py-3 rounded-xl bg-green-800 text-green-300 text-sm font-semibold">
            Continue with AI estimate
          </button>
        </div>
      )}

      {state === 'measuring' && (
        <div className="flex flex-col gap-4 items-center">
          {/* Bubble level */}
          <div className="relative w-24 h-24 rounded-full border-2 border-green-600 bg-green-950 flex items-center justify-center">
            {/* Center crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-px h-full bg-green-700 opacity-50" />
              <div className="absolute w-full h-px bg-green-700 opacity-50" />
              <div className="w-3 h-3 rounded-full border border-green-600" />
            </div>
            {/* Bubble */}
            <div
              className="absolute w-6 h-6 rounded-full bg-green-400 opacity-90 shadow-lg transition-transform"
              style={{ transform: `translate(${bubbleX}px, ${bubbleY}px)` }}
            />
          </div>

          {/* Readings */}
          <div className="grid grid-cols-3 gap-3 w-full text-center">
            <div className="bg-green-800 rounded-xl py-2">
              <div className="text-green-500 text-[9px] uppercase tracking-wider">Along</div>
              <div className="text-green-200 font-bold font-mono text-base">{beta.toFixed(1)}°</div>
            </div>
            <div className="bg-green-800 rounded-xl py-2">
              <div className="text-green-500 text-[9px] uppercase tracking-wider">Total</div>
              <div className="text-white font-bold font-mono text-base">{totalDeg}°</div>
            </div>
            <div className="bg-green-800 rounded-xl py-2">
              <div className="text-green-500 text-[9px] uppercase tracking-wider">Cross</div>
              <div className="text-green-200 font-bold font-mono text-base">{gamma.toFixed(1)}°</div>
            </div>
          </div>

          <p className="text-green-300 text-sm font-semibold">{slopeLabel(beta, gamma)}</p>

          <div className="flex gap-2 w-full">
            <button
              onClick={lockReading}
              className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"
              style={{ minHeight: 44 }}
            >
              ✓ Lock reading
            </button>
            <button
              onClick={onSkip}
              className="py-3 px-4 rounded-xl border border-green-700 text-green-400 text-sm hover:bg-green-800 transition-colors"
              style={{ minHeight: 44 }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {state === 'locked' && (
        <div className="text-center py-2">
          <div className="text-green-400 text-2xl mb-1">✓</div>
          <p className="text-green-300 text-sm font-semibold">
            {slopeLabel(beta, gamma)} · {totalDeg}° total
          </p>
        </div>
      )}
    </div>
  )
}
