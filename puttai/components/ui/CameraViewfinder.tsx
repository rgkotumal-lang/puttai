'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { GreenAnalysis } from '@/lib/types'
import { calcAimOffset } from '@/lib/calculations'

export interface AnalysisResult {
  ballPos: { x: number; y: number }
  holePos: { x: number; y: number }
  analysis: GreenAnalysis
  distanceFt?: number
  slopeDegrees?: number
  crossSlopeDegrees?: number
}

interface CameraViewfinderProps {
  onAnalysisComplete: (result: AnalysisResult) => void
  onReset: () => void
  confirmedGreenSpeed?: number
  onCapturing?: (capturing: boolean) => void
}

type Phase = 'ball' | 'walk' | 'analyzing' | 'done'
type GPS = { lat: number; lon: number }

const CYAN = '#22d3ee'
const BALL_POS = { x: 0.5, y: 0.80 }
const HOLE_POS = { x: 0.5, y: 0.15 }

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
}

function haversineDistanceFt(a: GPS, b: GPS): number {
  const R = 20902231
  const φ1 = a.lat * Math.PI / 180, φ2 = b.lat * Math.PI / 180
  const Δφ = (b.lat - a.lat) * Math.PI / 180, Δλ = (b.lon - a.lon) * Math.PI / 180
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

// Elliptical concentric-ring reticle — simulates AR ground projection
function ARReticle({ locked = false }: { locked?: boolean }) {
  const c = locked ? '#4ade80' : CYAN
  return (
    <svg width={200} height={120} viewBox="0 0 200 120"
      style={{ overflow: 'visible', pointerEvents: 'none', display: 'block' }}>
      {/* Outer scan ring */}
      <ellipse cx={100} cy={60} rx={96} ry={57} stroke={c} strokeWidth={0.8} fill="none" opacity={0.2} />
      {/* Mid ring */}
      <ellipse cx={100} cy={60} rx={70} ry={42} stroke={c} strokeWidth={1.5} fill="none" opacity={0.4} />
      {/* Inner ring with subtle fill */}
      <ellipse cx={100} cy={60} rx={42} ry={25} stroke={c} strokeWidth={2} fill={c + '1a'} opacity={0.9} />
      {/* Horizontal crosshair ticks */}
      <line x1={52} y1={60} x2={68} y2={60} stroke={c} strokeWidth={1.5} opacity={0.85} />
      <line x1={132} y1={60} x2={148} y2={60} stroke={c} strokeWidth={1.5} opacity={0.85} />
      {/* Vertical crosshair ticks (shorter — ellipse is flat) */}
      <line x1={100} y1={30} x2={100} y2={40} stroke={c} strokeWidth={1.5} opacity={0.85} />
      <line x1={100} y1={80} x2={100} y2={90} stroke={c} strokeWidth={1.5} opacity={0.85} />
      {/* Center dot */}
      <circle cx={100} cy={60} r={3.5} fill={c} />
      {/* Corner bracket locks when ball is marked */}
      {locked && (
        <>
          <path d="M 42 22 L 56 22 L 56 32" stroke={c} strokeWidth={2} fill="none" opacity={0.75} />
          <path d="M 158 22 L 144 22 L 144 32" stroke={c} strokeWidth={2} fill="none" opacity={0.75} />
          <path d="M 42 98 L 56 98 L 56 88" stroke={c} strokeWidth={2} fill="none" opacity={0.75} />
          <path d="M 158 98 L 144 98 L 144 88" stroke={c} strokeWidth={2} fill="none" opacity={0.75} />
        </>
      )}
    </svg>
  )
}

function PillButton({
  onClick, children, danger = false, className = '',
}: {
  onClick: () => void; children: React.ReactNode; danger?: boolean; className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full font-bold text-sm text-white active:scale-95 transition-transform select-none ${
        danger
          ? 'w-11 h-11 bg-blue-950/80 border border-red-500/60 text-red-400 flex items-center justify-center text-base'
          : 'px-10 py-3.5 bg-blue-800 border border-cyan-500/65 shadow-[0_0_16px_rgba(6,182,212,0.22)]'
      } ${className}`}
      style={{ minHeight: 44 }}
    >
      {children}
    </button>
  )
}

export default function CameraViewfinder({ onAnalysisComplete, onReset, confirmedGreenSpeed, onCapturing }: CameraViewfinderProps) {
  const videoRef      = useRef<HTMLVideoElement | null>(null)
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const capturedRef   = useRef('')
  const streamRef     = useRef<MediaStream | null>(null)
  const rafRef        = useRef<number>(0)
  const ballGPSRef    = useRef<GPS | null>(null)
  const holeGPSRef    = useRef<GPS | null>(null)
  const watchIdRef    = useRef<number | null>(null)
  const distFtRef     = useRef<number | undefined>(undefined)

  const videoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current
      el.play().catch(() => {})
    }
  }, [])

  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'denied' | 'unavailable'>('loading')
  const [phase, setPhase]             = useState<Phase>('ball')
  const [walkedFt, setWalkedFt]       = useState<number | null>(null)
  const [gpsAvail, setGpsAvail]       = useState(true)
  const [analysis, setAnalysis]       = useState<GreenAnalysis | null>(null)

  const stateRef = useRef({ phase, analysis })
  stateRef.current = { phase, analysis }

  useEffect(() => {
    onCapturing?.(phase === 'ball' || phase === 'walk')
  }, [phase, onCapturing])

  // ── Camera ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        setCameraState('ready')
      } catch (err: unknown) {
        if (cancelled) return
        setCameraState(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unavailable')
      }
    }
    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ── GPS during walk ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'walk') {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null
      }
      return
    }
    if (!navigator.geolocation) { setGpsAvail(false); return }
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const curr: GPS = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        holeGPSRef.current = curr
        if (ballGPSRef.current) setWalkedFt(haversineDistanceFt(ballGPSRef.current, curr))
      },
      () => setGpsAvail(false),
      { enableHighAccuracy: true, maximumAge: 0 }
    )
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null
      }
    }
  }, [phase])

  // ── Canvas RAF loop ──────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const W = canvas.width, H = canvas.height
    const { phase: ps, analysis: an } = stateRef.current

    ctx.clearRect(0, 0, W, H)

    if (ps === 'done' && an) {
      const bx = W * 0.5, by = H * 0.87
      const sign = an.breakDirection === 'left' ? -1 : an.breakDirection === 'right' ? 1 : 0
      const hx = W * 0.5 + sign * an.breakIntensity * 14
      const hy = H * 0.10

      // ── Perspective grid ──
      const spreadW = W * 1.5
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'
      ctx.lineWidth = 1
      ctx.setLineDash([])
      const fanN = 14
      for (let i = 0; i <= fanN; i++) {
        const bLineX = W * -0.25 + (i / fanN) * spreadW
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bLineX, H); ctx.stroke()
      }
      const crossN = 10
      for (let j = 1; j <= crossN; j++) {
        const t = (j / crossN) ** 1.7
        const ly = hy + t * (H * 0.93 - hy)
        const hw = t * spreadW * 0.5
        ctx.beginPath(); ctx.moveTo(hx - hw, ly); ctx.lineTo(hx + hw, ly); ctx.stroke()
      }

      // ── Corridor ──
      const cpx = (bx + hx) / 2 + sign * an.breakIntensity * 8
      const cpy = (by + hy) / 2
      const edge = 14

      // Blue main path
      ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 10
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cpx, cpy, hx, hy)
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3.5; ctx.stroke()
      ctx.shadowBlur = 0

      // Orange right edge
      ctx.beginPath()
      ctx.moveTo(bx + edge, by)
      ctx.quadraticCurveTo(cpx + edge * 0.5, cpy, hx + edge * 0.3, hy)
      ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2; ctx.stroke()

      // Cyan left edge
      ctx.beginPath()
      ctx.moveTo(bx - edge, by)
      ctx.quadraticCurveTo(cpx - edge * 0.5, cpy, hx - edge * 0.3, hy)
      ctx.strokeStyle = CYAN; ctx.lineWidth = 1.5; ctx.stroke()

      // ── Hole marker ──
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.arc(hx, hy, 20, 0, Math.PI * 2)
      ctx.strokeStyle = CYAN + 'aa'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.setLineDash([])

      ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#111'; ctx.fill()
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.stroke()

      // Flag
      ctx.beginPath(); ctx.moveTo(hx + 7, hy); ctx.lineTo(hx + 7, hy - 28)
      ctx.strokeStyle = CYAN; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(hx + 7, hy - 28); ctx.lineTo(hx + 21, hy - 21); ctx.lineTo(hx + 7, hy - 14)
      ctx.closePath(); ctx.fillStyle = '#ef4444'; ctx.fill()

      // Chevron below hole pointing down
      ctx.save(); ctx.translate(hx, hy + 32)
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(-11, -7); ctx.lineTo(0, 7); ctx.lineTo(11, -7); ctx.stroke()
      ctx.restore()

      // ── Ball marker ──
      ctx.shadowColor = CYAN; ctx.shadowBlur = 12
      ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2)
      ctx.fillStyle = CYAN; ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    if (cameraState !== 'ready') return
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [cameraState, draw])

  // ── Mark Ball ─────────────────────────────────────────────────────────────
  function handleMarkBall() {
    haptic()
    // Capture frame at ball position (camera points toward hole)
    const video = videoRef.current
    if (video) {
      const cap = document.createElement('canvas')
      cap.width = 640; cap.height = 360
      cap.getContext('2d')?.drawImage(video, 0, 0, 640, 360)
      capturedRef.current = cap.toDataURL('image/jpeg', 0.82).split(',')[1]
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => { ballGPSRef.current = { lat: p.coords.latitude, lon: p.coords.longitude } },
        () => setGpsAvail(false),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      )
    } else { setGpsAvail(false) }
    setPhase('walk')
  }

  // ── Mark Hole → analyze ──────────────────────────────────────────────────
  async function handleMarkHole() {
    haptic()
    setPhase('analyzing')

    if (!holeGPSRef.current && navigator.geolocation) {
      await new Promise<void>(resolve => {
        navigator.geolocation.getCurrentPosition(
          p => { holeGPSRef.current = { lat: p.coords.latitude, lon: p.coords.longitude }; resolve() },
          () => resolve(),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        )
      })
    }

    const distanceFt = ballGPSRef.current && holeGPSRef.current
      ? parseFloat(haversineDistanceFt(ballGPSRef.current, holeGPSRef.current).toFixed(1))
      : walkedFt !== null ? parseFloat(walkedFt.toFixed(1)) : undefined

    distFtRef.current = distanceFt

    try {
      const res = await fetch('/api/read-green', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: capturedRef.current,
          ballPos: BALL_POS,
          holePos: HOLE_POS,
          distanceFt,
          perspective: 'from_ball',
          confirmedGreenSpeed,
        }),
      })
      const data = await res.json()
      setAnalysis(data.analysis)
      setPhase('done')
      onAnalysisComplete({ ballPos: BALL_POS, holePos: HOLE_POS, analysis: data.analysis, distanceFt })
    } catch {
      const fallback: GreenAnalysis = {
        breakDirection: 'straight', breakIntensity: 2,
        greenSpeed: confirmedGreenSpeed ?? 10,
        slope: 'flat', grain: 'neutral', confidence: 30,
        notes: 'Analysis failed — using defaults',
      }
      setAnalysis(fallback)
      setPhase('done')
      onAnalysisComplete({ ballPos: BALL_POS, holePos: HOLE_POS, analysis: fallback, distanceFt })
    }
    haptic()
  }

  function handleReset() {
    haptic()
    capturedRef.current = ''
    setWalkedFt(null); setGpsAvail(true); setAnalysis(null)
    ballGPSRef.current = null; holeGPSRef.current = null; distFtRef.current = undefined
    setPhase('ball'); onReset()
  }

  function aimLabel(): string {
    if (!analysis) return ''
    if (analysis.breakDirection === 'straight') return 'Straight'
    const inches = Math.abs(calcAimOffset(analysis.breakDirection, analysis.breakIntensity))
    const cm = Math.round(inches * 2.54)
    const dir = analysis.breakDirection === 'left' ? 'Left' : 'Right'
    return `${dir} ${cm} cm`
  }

  const fullscreen = phase === 'ball' || phase === 'walk'

  const cameraShell = (
    <div
      className="w-full overflow-hidden bg-black select-none"
      style={fullscreen
        ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }
        : { position: 'relative', height: 500, borderRadius: '1rem' }
      }
    >
        {/* Live camera — hidden once we have a captured image to show */}
        <video
          ref={videoCallbackRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: capturedRef.current ? 'none' : undefined }}
        />
        {/* Captured photo shown in analyzing/done phases */}
        {capturedRef.current && (
          <img
            src={`data:image/jpeg;base64,${capturedRef.current}`}
            className="absolute inset-0 w-full h-full object-cover"
            alt=""
          />
        )}
        <canvas ref={canvasRef} width={640} height={500} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* ── Top instruction banner ── */}
        {(phase === 'ball' || phase === 'walk') && (
          <div className="absolute left-0 right-0 flex justify-center pointer-events-none z-10" style={{ top: 'max(12px, env(safe-area-inset-top, 12px))' }}>
            <div className="bg-blue-950/80 border border-cyan-500/50 text-cyan-200 text-[11px] font-semibold px-4 py-1.5 rounded-full tracking-wide">
              {phase === 'ball' ? 'Point toward hole · tap Mark Ball' : 'Walk to the hole to mark'}
            </div>
          </div>
        )}

        {/* ── AR Reticle ── */}
        {cameraState === 'ready' && (phase === 'ball' || phase === 'walk') && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ paddingBottom: '15%' }}
          >
            <div style={{ animation: phase === 'ball' ? 'pulse 2s ease-in-out infinite' : 'none' }}>
              <ARReticle locked={phase === 'walk'} />
            </div>
          </div>
        )}

        {/* ── Walk: live GPS distance ── */}
        {phase === 'walk' && (
          <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ bottom: 72 }}>
            {walkedFt !== null ? (
              <div className="bg-blue-950/85 border border-cyan-500/35 rounded-xl px-5 py-2 flex items-baseline gap-2">
                <span className="text-cyan-500 text-[10px] uppercase tracking-wider">Distance</span>
                <span className="text-white font-bold font-mono text-base">{walkedFt.toFixed(1)} ft</span>
              </div>
            ) : gpsAvail ? (
              <div className="flex items-center gap-2 bg-blue-950/70 px-3 py-1.5 rounded-full">
                <div className="w-2.5 h-2.5 rounded-full border border-cyan-400 border-t-transparent animate-spin" />
                <span className="text-cyan-400 text-[10px]">Acquiring GPS…</span>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Done: info panel ── */}
        {phase === 'done' && analysis && (
          <div className="absolute top-3 right-3 bg-blue-950/90 border border-cyan-500/40 rounded-xl px-3 py-2.5 min-w-[148px]">
            <div className="text-[9px] text-cyan-500 uppercase tracking-wider mb-0.5">Distance to hole</div>
            <div className="text-white font-bold font-mono text-sm mb-2.5">
              {distFtRef.current ? `${distFtRef.current.toFixed(1)} ft` : '—'}
            </div>
            <div className="text-[9px] text-cyan-500 uppercase tracking-wider mb-0.5">Aim</div>
            <div className="text-white font-bold text-sm">{aimLabel()}</div>
          </div>
        )}

        {/* ── Analyzing overlay ── */}
        {phase === 'analyzing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 gap-3">
            <div className="w-9 h-9 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-cyan-300 text-sm font-semibold tracking-wide">Reading green…</span>
          </div>
        )}

        {/* ── Camera error states ── */}
        {cameraState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 gap-2">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-cyan-300 text-sm">Starting camera…</span>
          </div>
        )}
        {cameraState === 'denied' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 gap-3 px-6 text-center">
            <span className="text-3xl">📷</span>
            <p className="text-white text-sm font-semibold">Camera permission denied</p>
            <p className="text-gray-400 text-xs">Allow camera access in your browser settings and reload.</p>
          </div>
        )}
        {cameraState === 'unavailable' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 gap-3 px-6 text-center">
            <span className="text-3xl">⛳</span>
            <p className="text-white text-sm font-semibold">Camera unavailable</p>
            <p className="text-gray-400 text-xs">Open on a mobile device over HTTPS for the full experience.</p>
          </div>
        )}

        {/* ── Bottom action buttons (overlaid on camera) ── */}
        <div className="absolute left-0 right-0 flex items-center justify-center gap-3 pointer-events-none" style={{ bottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
          {phase === 'ball' && cameraState === 'ready' && (
            <div className="pointer-events-auto">
              <PillButton onClick={handleMarkBall}>Mark Ball</PillButton>
            </div>
          )}

          {phase === 'walk' && (
            <>
              <div className="pointer-events-auto">
                <PillButton onClick={handleMarkHole}>Mark Hole</PillButton>
              </div>
              <div className="pointer-events-auto absolute right-4">
                <PillButton onClick={handleReset} danger>✕</PillButton>
              </div>
            </>
          )}

          {phase === 'done' && (
            <div className="pointer-events-auto">
              <PillButton onClick={handleReset}>Reset</PillButton>
            </div>
          )}
        </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-0">
      {cameraShell}
    </div>
  )
}
