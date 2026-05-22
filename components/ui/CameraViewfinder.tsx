'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { GreenAnalysis } from '@/lib/types'

interface AnalysisResult {
  ballPos: { x: number; y: number }
  holePos: { x: number; y: number }
  analysis: GreenAnalysis
}

interface CameraViewfinderProps {
  onAnalysisComplete: (result: AnalysisResult) => void
  onReset: () => void
}

type Phase = 'ball' | 'hole' | 'ready' | 'analyzing' | 'done'

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
}

// Professional crosshair reticle
function Reticle({ color, label, active }: { color: string; label: string; active: boolean }) {
  const op = active ? 1 : 0.5
  return (
    <svg width={64} height={72} viewBox="0 0 64 72" style={{ overflow: 'visible', pointerEvents: 'none', display: 'block' }}>
      {/* Outer ring */}
      <circle cx={32} cy={32} r={20} stroke={color} strokeWidth={active ? 2 : 1.5}
        strokeOpacity={op} fill={active ? `${color}22` : 'none'} />
      {/* Cross ticks extending outside ring */}
      <line x1={32} y1={5}  x2={32} y2={15} stroke={color} strokeWidth={2} strokeOpacity={op} />
      <line x1={32} y1={49} x2={32} y2={59} stroke={color} strokeWidth={2} strokeOpacity={op} />
      <line x1={5}  y1={32} x2={15} y2={32} stroke={color} strokeWidth={2} strokeOpacity={op} />
      <line x1={49} y1={32} x2={59} y2={32} stroke={color} strokeWidth={2} strokeOpacity={op} />
      {/* Center dot */}
      <circle cx={32} cy={32} r={3} fill={color} fillOpacity={op} />
      {/* Label below */}
      <text x={32} y={68} textAnchor="middle" fill={color} fillOpacity={op}
        fontSize={7} fontWeight="bold" letterSpacing={1.2} fontFamily="monospace">
        {label}
      </text>
    </svg>
  )
}

export default function CameraViewfinder({ onAnalysisComplete, onReset }: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'denied' | 'unavailable'>('loading')
  const [phase, setPhase] = useState<Phase>('ball')
  const [ballPos, setBallPos] = useState({ x: 0.5, y: 0.72 })
  const [holePos, setHolePos] = useState({ x: 0.5, y: 0.28 })
  const [analysis, setAnalysis] = useState<GreenAnalysis | null>(null)

  const stateRef = useRef({ phase, ballPos, holePos, analysis })
  stateRef.current = { phase, ballPos, holePos, analysis }

  const ballDragRef = useRef({ active: false, startX: 0, startY: 0, moved: false })
  const holeDragRef = useRef({ active: false, startX: 0, startY: 0, moved: false })

  useEffect(() => {
    let cancelled = false
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraState('ready')
      } catch (err: unknown) {
        if (cancelled) return
        setCameraState(
          err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unavailable'
        )
      }
    }
    startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    const { phase: ps, ballPos: bp, holePos: hp, analysis: an } = stateRef.current

    ctx.clearRect(0, 0, W, H)

    // — Grid —
    ctx.strokeStyle = 'rgba(76,175,80,0.18)'
    ctx.lineWidth = 0.5
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo((W / 5) * i, 0); ctx.lineTo((W / 5) * i, H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, (H / 5) * i); ctx.lineTo(W, (H / 5) * i); ctx.stroke()
    }

    // — Corner brackets —
    const B = 22
    ctx.strokeStyle = 'rgba(76,175,80,0.85)'
    ctx.lineWidth = 2
    for (const [cx, cy, dx, dy] of [[0,0,1,1],[W,0,-1,1],[0,H,1,-1],[W,H,-1,-1]] as [number,number,number,number][]) {
      ctx.beginPath()
      ctx.moveTo(cx + dx * B, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * B)
      ctx.stroke()
    }

    // — Preview line during placement —
    if (ps === 'hole' || ps === 'ready') {
      const bx = bp.x * W; const by = bp.y * H
      const hx = hp.x * W; const hy = hp.y * H
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy)
      ctx.strokeStyle = 'rgba(76,175,80,0.4)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([])
    }

    if (ps !== 'done' || !an) {
      rafRef.current = requestAnimationFrame(draw)
      return
    }

    // — Full overlay (done phase) —
    const bx = bp.x * W; const by = bp.y * H
    const hx = hp.x * W; const hy = hp.y * H

    const ddx = hx - bx; const ddy = hy - by
    const len = Math.sqrt(ddx * ddx + ddy * ddy) || 1
    const perpX = -ddy / len; const perpY = ddx / len
    const sign = an.breakDirection === 'left' ? 1 : an.breakDirection === 'right' ? -1 : 0
    const offset = an.breakIntensity * 18 * sign
    const cpx = (bx + hx) / 2 + perpX * offset
    const cpy = (by + hy) / 2 + perpY * offset

    // — Slope arrows on grid intersections —
    if (an.slope !== 'flat') {
      const slopeSign = an.slope === 'downhill' ? 1 : -1
      const lateralFactor = an.breakDirection === 'left' ? 0.4 : an.breakDirection === 'right' ? -0.4 : 0
      const rawAX = (ddx / len) * slopeSign + perpX * lateralFactor
      const rawAY = (ddy / len) * slopeSign + perpY * lateralFactor
      const aLen = Math.sqrt(rawAX * rawAX + rawAY * rawAY) || 1
      const aX = (rawAX / aLen) * 7; const aY = (rawAY / aLen) * 7
      const headAngle = Math.atan2(aY, aX)
      ctx.strokeStyle = 'rgba(76,175,80,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([])
      for (let gi = 1; gi <= 4; gi++) {
        for (let gj = 1; gj <= 4; gj++) {
          const ix = (W / 5) * gi; const iy = (H / 5) * gj
          const tx = ix + aX; const ty = iy + aY
          ctx.beginPath(); ctx.moveTo(ix - aX * 0.6, iy - aY * 0.6); ctx.lineTo(tx, ty); ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(tx, ty); ctx.lineTo(tx - 4 * Math.cos(headAngle - 0.45), ty - 4 * Math.sin(headAngle - 0.45))
          ctx.moveTo(tx, ty); ctx.lineTo(tx - 4 * Math.cos(headAngle + 0.45), ty - 4 * Math.sin(headAngle + 0.45))
          ctx.stroke()
        }
      }
    }

    // — Speed corridor (wide soft band around break line) —
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cpx, cpy, hx, hy)
    ctx.strokeStyle = 'rgba(76,175,80,0.05)'; ctx.lineWidth = 50; ctx.setLineDash([]); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cpx, cpy, hx, hy)
    ctx.strokeStyle = 'rgba(76,175,80,0.08)'; ctx.lineWidth = 28; ctx.stroke()

    // — Glow —
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cpx, cpy, hx, hy)
    ctx.strokeStyle = 'rgba(76,175,80,0.22)'; ctx.lineWidth = 8; ctx.stroke()

    // — Gradient break line —
    const grad = ctx.createLinearGradient(bx, by, hx, hy)
    grad.addColorStop(0, 'rgba(255,255,255,0.95)')
    grad.addColorStop(0.4, 'rgba(180,230,180,0.95)')
    grad.addColorStop(1, 'rgba(76,175,80,0.95)')
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cpx, cpy, hx, hy)
    ctx.strokeStyle = grad; ctx.lineWidth = 2.5; ctx.setLineDash([9, 5]); ctx.stroke()
    ctx.setLineDash([])

    // — Direction chevrons —
    for (const t of [0.28, 0.58]) {
      const ax = (1-t)*(1-t)*bx + 2*(1-t)*t*cpx + t*t*hx
      const ay = (1-t)*(1-t)*by + 2*(1-t)*t*cpy + t*t*hy
      const t2 = Math.min(t + 0.02, 1)
      const ax2 = (1-t2)*(1-t2)*bx + 2*(1-t2)*t2*cpx + t2*t2*hx
      const ay2 = (1-t2)*(1-t2)*by + 2*(1-t2)*t2*cpy + t2*t2*hy
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(ay2 - ay, ax2 - ax))
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(0, 0); ctx.lineTo(-7, 4); ctx.stroke()
      ctx.restore()
    }

    // — Aim dashed line from ball to aim point —
    const aimOffsetPx = an.breakIntensity * 6 * sign
    const aimX = hx + perpX * aimOffsetPx * 2
    const aimY = hy + perpY * aimOffsetPx * 2
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(aimX, aimY)
    ctx.strokeStyle = 'rgba(255,183,77,0.22)'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.stroke()
    ctx.setLineDash([])

    // — Aim crosshair —
    ctx.beginPath(); ctx.arc(aimX, aimY, 13, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,183,77,0.35)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.beginPath(); ctx.arc(aimX, aimY, 6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,183,77,0.9)'; ctx.fill()
    ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.strokeStyle = 'rgba(255,183,77,0.75)'; ctx.lineWidth = 1.5
    for (const [x1,y1,x2,y2] of [
      [aimX, aimY-17, aimX, aimY-12],
      [aimX, aimY+12, aimX, aimY+17],
      [aimX-17, aimY, aimX-12, aimY],
      [aimX+12, aimY, aimX+17, aimY],
    ] as [number,number,number,number][]) {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
    }

    // — Hole flag —
    ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#111'; ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(hx, hy - 8); ctx.lineTo(hx, hy - 30)
    ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(hx, hy - 30); ctx.lineTo(hx + 13, hy - 24); ctx.lineTo(hx, hy - 18)
    ctx.closePath(); ctx.fillStyle = '#ef4444'; ctx.fill()

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    if (cameraState !== 'ready') return
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [cameraState, draw])

  function getContainerPos(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.max(0.06, Math.min(0.94, (clientX - rect.left) / rect.width)),
      y: Math.max(0.06, Math.min(0.94, (clientY - rect.top) / rect.height)),
    }
  }

  function onBallPointerDown(e: React.PointerEvent) {
    if (phase !== 'ball') return
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    ballDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, moved: false }
  }
  function onBallPointerMove(e: React.PointerEvent) {
    if (!ballDragRef.current.active) return
    e.stopPropagation()
    if (Math.hypot(e.clientX - ballDragRef.current.startX, e.clientY - ballDragRef.current.startY) > 8) {
      ballDragRef.current.moved = true
      const pos = getContainerPos(e.clientX, e.clientY)
      if (pos) setBallPos(pos)
    }
  }
  function onBallPointerUp(e: React.PointerEvent) {
    if (!ballDragRef.current.active) return
    e.stopPropagation()
    ballDragRef.current.active = false
    if (!ballDragRef.current.moved) { haptic(); setPhase('hole') }
  }

  function onHolePointerDown(e: React.PointerEvent) {
    if (phase !== 'hole') return
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    holeDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, moved: false }
  }
  function onHolePointerMove(e: React.PointerEvent) {
    if (!holeDragRef.current.active) return
    e.stopPropagation()
    if (Math.hypot(e.clientX - holeDragRef.current.startX, e.clientY - holeDragRef.current.startY) > 8) {
      holeDragRef.current.moved = true
      const pos = getContainerPos(e.clientX, e.clientY)
      if (pos) setHolePos(pos)
    }
  }
  function onHolePointerUp(e: React.PointerEvent) {
    if (!holeDragRef.current.active) return
    e.stopPropagation()
    holeDragRef.current.active = false
    if (!holeDragRef.current.moved) { haptic(); setPhase('ready') }
  }

  async function handleAnalyze() {
    if (!videoRef.current) return
    haptic()
    setPhase('analyzing')

    const capture = document.createElement('canvas')
    capture.width = 640; capture.height = 360
    capture.getContext('2d')?.drawImage(videoRef.current, 0, 0, 640, 360)
    const imageBase64 = capture.toDataURL('image/jpeg', 0.8).split(',')[1]

    try {
      const res = await fetch('/api/read-green', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64, ballPos, holePos }),
      })
      const data = await res.json()
      setAnalysis(data.analysis)
      setPhase('done')
      onAnalysisComplete({ ballPos, holePos, analysis: data.analysis })
    } catch {
      const fallback: GreenAnalysis = {
        breakDirection: 'straight', breakIntensity: 2, greenSpeed: 10,
        slope: 'flat', grain: 'neutral', confidence: 30,
        notes: 'Analysis failed — using defaults',
      }
      setAnalysis(fallback)
      setPhase('done')
      onAnalysisComplete({ ballPos, holePos, analysis: fallback })
    }
    haptic()
  }

  function handleReset() {
    haptic()
    setBallPos({ x: 0.5, y: 0.72 })
    setHolePos({ x: 0.5, y: 0.28 })
    setAnalysis(null)
    setPhase('ball')
    onReset()
  }

  const showBall = cameraState === 'ready' && phase !== 'analyzing'
  const showHole = cameraState === 'ready' && phase !== 'analyzing' && phase !== 'ball'

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl bg-green-950 select-none"
        style={{ height: 340 }}
      >
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} width={640} height={340} className="absolute inset-0 w-full h-full" />

        {/* Ball reticle */}
        {showBall && (
          <div
            className={phase === 'ball' ? 'animate-pulse' : ''}
            style={{
              position: 'absolute',
              left: `${ballPos.x * 100}%`,
              top: `${ballPos.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              cursor: phase === 'ball' ? 'grab' : 'default',
              touchAction: 'none',
              userSelect: 'none',
            }}
            onPointerDown={onBallPointerDown}
            onPointerMove={onBallPointerMove}
            onPointerUp={onBallPointerUp}
          >
            <Reticle color="white" label="BALL" active={phase === 'ball'} />
          </div>
        )}

        {/* Hole reticle */}
        {showHole && (
          <div
            className={phase === 'hole' ? 'animate-pulse' : ''}
            style={{
              position: 'absolute',
              left: `${holePos.x * 100}%`,
              top: `${holePos.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              cursor: phase === 'hole' ? 'grab' : 'default',
              touchAction: 'none',
              userSelect: 'none',
            }}
            onPointerDown={onHolePointerDown}
            onPointerMove={onHolePointerMove}
            onPointerUp={onHolePointerUp}
          >
            <Reticle color="#ffb74d" label="HOLE" active={phase === 'hole'} />
          </div>
        )}

        {/* Step label */}
        {cameraState === 'ready' && phase !== 'analyzing' && phase !== 'done' && (
          <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
            <span className="bg-black/60 text-white text-[11px] px-3 py-1 rounded-full tracking-wide">
              {phase === 'ball' && 'Drag white reticle to your ball · tap to place'}
              {phase === 'hole' && 'Drag gold reticle to the hole · tap to place'}
              {phase === 'ready' && 'Tap Analyze to read the green'}
            </span>
          </div>
        )}

        {/* Analyzing overlay */}
        {phase === 'analyzing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-2">
            <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-green-300 text-sm font-semibold">Reading green…</span>
          </div>
        )}

        {cameraState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-950/90 gap-2">
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-green-400 text-sm">Starting camera…</span>
          </div>
        )}
        {cameraState === 'denied' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-950/90 gap-3 px-6 text-center">
            <span className="text-3xl">📷</span>
            <p className="text-green-300 text-sm font-semibold">Camera permission denied</p>
            <p className="text-green-500 text-xs">Allow camera access in browser settings and reload.</p>
          </div>
        )}
        {cameraState === 'unavailable' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-950/90 gap-3 px-6 text-center">
            <span className="text-3xl">⛳</span>
            <p className="text-green-300 text-sm font-semibold">Camera unavailable</p>
            <p className="text-green-500 text-xs">Open on a mobile device over HTTPS for the full experience.</p>
          </div>
        )}
      </div>

      {cameraState === 'ready' && (
        <div className="flex gap-2">
          {phase === 'ready' && (
            <button
              onClick={handleAnalyze}
              className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"
              style={{ minHeight: 44 }}
            >
              🔍 Analyze green
            </button>
          )}
          {(phase === 'ready' || phase === 'done') && (
            <button
              onClick={handleReset}
              className="py-3 px-4 rounded-xl border border-green-700 text-green-400 text-sm font-semibold hover:bg-green-900 transition-colors"
              style={{ minHeight: 44 }}
            >
              ↺ Start over
            </button>
          )}
        </div>
      )}
    </div>
  )
}
