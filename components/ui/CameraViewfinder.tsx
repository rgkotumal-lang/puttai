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

    // Grid
    ctx.strokeStyle = 'rgba(76,175,80,0.2)'
    ctx.lineWidth = 0.5
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo((W / 5) * i, 0); ctx.lineTo((W / 5) * i, H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, (H / 5) * i); ctx.lineTo(W, (H / 5) * i); ctx.stroke()
    }

    // Corner brackets
    const B = 20
    ctx.strokeStyle = 'rgba(76,175,80,0.8)'
    ctx.lineWidth = 2
    for (const [cx, cy, dx, dy] of [[0,0,1,1],[W,0,-1,1],[0,H,1,-1],[W,H,-1,-1]] as [number,number,number,number][]) {
      ctx.beginPath()
      ctx.moveTo(cx + dx * B, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * B)
      ctx.stroke()
    }

    if (ps === 'done' && an) {
      const bx = bp.x * W
      const by = bp.y * H
      const hx = hp.x * W
      const hy = hp.y * H

      const ddx = hx - bx
      const ddy = hy - by
      const len = Math.sqrt(ddx * ddx + ddy * ddy) || 1
      const perpX = -ddy / len
      const perpY = ddx / len
      const sign = an.breakDirection === 'left' ? 1 : an.breakDirection === 'right' ? -1 : 0
      const offset = an.breakIntensity * 18 * sign
      const cpx = (bx + hx) / 2 + perpX * offset
      const cpy = (by + hy) / 2 + perpY * offset

      // Glow
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cpx, cpy, hx, hy)
      ctx.strokeStyle = 'rgba(76,175,80,0.25)'; ctx.lineWidth = 8; ctx.setLineDash([]); ctx.stroke()

      // Main path
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cpx, cpy, hx, hy)
      ctx.strokeStyle = 'rgba(76,175,80,0.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 4]); ctx.stroke()
      ctx.setLineDash([])

      // Chevrons
      for (const t of [0.33, 0.66]) {
        const ax = (1-t)*(1-t)*bx + 2*(1-t)*t*cpx + t*t*hx
        const ay = (1-t)*(1-t)*by + 2*(1-t)*t*cpy + t*t*hy
        const t2 = Math.min(t + 0.02, 1)
        const ax2 = (1-t2)*(1-t2)*bx + 2*(1-t2)*t2*cpx + t2*t2*hx
        const ay2 = (1-t2)*(1-t2)*by + 2*(1-t2)*t2*cpy + t2*t2*hy
        ctx.save()
        ctx.translate(ax, ay); ctx.rotate(Math.atan2(ay2 - ay, ax2 - ax))
        ctx.strokeStyle = 'rgba(76,175,80,0.9)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(0, 0); ctx.lineTo(-5, 4); ctx.stroke()
        ctx.restore()
      }

      // Aim point
      const aimOffsetPx = an.breakIntensity * 6 * sign
      const aimX = hx + perpX * aimOffsetPx * 2
      const aimY = hy + perpY * aimOffsetPx * 2
      ctx.beginPath(); ctx.arc(aimX, aimY, 6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,183,77,0.85)'; ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke()
    }

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

        {/* Ball circle — white, draggable in 'ball' phase */}
        {showBall && (
          <div
            className={phase === 'ball' ? 'animate-pulse' : ''}
            style={{
              position: 'absolute',
              left: `${ballPos.x * 100}%`,
              top: `${ballPos.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: 52, height: 52,
              borderRadius: '50%',
              border: phase === 'ball' ? '2.5px solid white' : '2px solid rgba(255,255,255,0.45)',
              backgroundColor: phase === 'ball' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
              boxShadow: phase === 'ball' ? '0 0 0 5px rgba(255,255,255,0.12), 0 0 16px rgba(255,255,255,0.25)' : 'none',
              cursor: phase === 'ball' ? 'grab' : 'default',
              touchAction: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              userSelect: 'none',
            }}
            onPointerDown={onBallPointerDown}
            onPointerMove={onBallPointerMove}
            onPointerUp={onBallPointerUp}
          >
            <span style={{ color: 'white', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, pointerEvents: 'none' }}>
              {phase === 'ball' ? 'BALL' : '●'}
            </span>
          </div>
        )}

        {/* Hole circle — gold, draggable in 'hole' phase */}
        {showHole && (
          <div
            className={phase === 'hole' ? 'animate-pulse' : ''}
            style={{
              position: 'absolute',
              left: `${holePos.x * 100}%`,
              top: `${holePos.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: 52, height: 52,
              borderRadius: '50%',
              border: phase === 'hole' ? '2.5px solid #ffb74d' : '2px solid rgba(255,183,77,0.45)',
              backgroundColor: phase === 'hole' ? 'rgba(255,183,77,0.18)' : 'rgba(255,183,77,0.08)',
              boxShadow: phase === 'hole' ? '0 0 0 5px rgba(255,183,77,0.12), 0 0 16px rgba(255,183,77,0.25)' : 'none',
              cursor: phase === 'hole' ? 'grab' : 'default',
              touchAction: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              userSelect: 'none',
            }}
            onPointerDown={onHolePointerDown}
            onPointerMove={onHolePointerMove}
            onPointerUp={onHolePointerUp}
          >
            <span style={{ color: '#ffb74d', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, pointerEvents: 'none' }}>
              {phase === 'hole' ? 'HOLE' : '⛳'}
            </span>
          </div>
        )}

        {/* Step label */}
        {cameraState === 'ready' && phase !== 'analyzing' && phase !== 'done' && (
          <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
            <span className="bg-black/60 text-white text-[11px] px-3 py-1 rounded-full">
              {phase === 'ball' && 'Drag white circle to your ball · tap to place'}
              {phase === 'hole' && 'Drag gold circle to the hole · tap to place'}
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
