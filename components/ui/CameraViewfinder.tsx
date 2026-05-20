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

type PlacingState = 'ball' | 'hole' | 'ready' | 'analyzing' | 'done'

const STEP_LABELS: Record<PlacingState, string> = {
  ball: 'Step 1 — Tap to mark your ball',
  hole: 'Step 2 — Tap to mark the hole',
  ready: 'Ready — tap Analyze to read the green',
  analyzing: 'Reading the green…',
  done: 'Green read complete',
}

export default function CameraViewfinder({ onAnalysisComplete, onReset }: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'denied' | 'unavailable'>('loading')
  const [placingState, setPlacingState] = useState<PlacingState>('ball')
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null)
  const [holePos, setHolePos] = useState<{ x: number; y: number } | null>(null)
  const [analysis, setAnalysis] = useState<GreenAnalysis | null>(null)

  // Refs for animation loop access
  const stateRef = useRef({ placingState, ballPos, holePos, analysis })
  stateRef.current = { placingState, ballPos, holePos, analysis }

  // Start camera
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

  // Canvas draw loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    const { placingState: ps, ballPos: bp, holePos: hp, analysis: an } = stateRef.current

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

    if (!bp) { rafRef.current = requestAnimationFrame(draw); return }

    const bx = bp.x * W
    const by = bp.y * H

    if (hp) {
      const hx = hp.x * W
      const hy = hp.y * H

      if (ps === 'done' && an) {
        // Compute curved path with proper perpendicular break offset
        const dx = hx - bx
        const dy = hy - by
        const len = Math.sqrt(dx * dx + dy * dy) || 1
        const perpX = -dy / len
        const perpY = dx / len
        const sign = an.breakDirection === 'left' ? 1 : an.breakDirection === 'right' ? -1 : 0
        const offset = an.breakIntensity * 18 * sign
        const cpx = (bx + hx) / 2 + perpX * offset
        const cpy = (by + hy) / 2 + perpY * offset

        // Glow
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.quadraticCurveTo(cpx, cpy, hx, hy)
        ctx.strokeStyle = 'rgba(76,175,80,0.25)'
        ctx.lineWidth = 8
        ctx.setLineDash([])
        ctx.stroke()

        // Main path
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.quadraticCurveTo(cpx, cpy, hx, hy)
        ctx.strokeStyle = 'rgba(76,175,80,0.9)'
        ctx.lineWidth = 2.5
        ctx.setLineDash([8, 4])
        ctx.stroke()
        ctx.setLineDash([])

        // Chevrons at 33% and 66%
        for (const t of [0.33, 0.66]) {
          const ax = (1-t)*(1-t)*bx + 2*(1-t)*t*cpx + t*t*hx
          const ay = (1-t)*(1-t)*by + 2*(1-t)*t*cpy + t*t*hy
          const t2 = Math.min(t + 0.02, 1)
          const ax2 = (1-t2)*(1-t2)*bx + 2*(1-t2)*t2*cpx + t2*t2*hx
          const ay2 = (1-t2)*(1-t2)*by + 2*(1-t2)*t2*cpy + t2*t2*hy
          const angle = Math.atan2(ay2 - ay, ax2 - ax)
          ctx.save()
          ctx.translate(ax, ay)
          ctx.rotate(angle)
          ctx.strokeStyle = 'rgba(76,175,80,0.9)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(-5, -4); ctx.lineTo(0, 0); ctx.lineTo(-5, 4)
          ctx.stroke()
          ctx.restore()
        }

        // Aim point (where to aim, offset by break)
        const aimOffsetPx = an.breakIntensity * 6 * sign
        const aimX = hx + perpX * aimOffsetPx * 2
        const aimY = hy + perpY * aimOffsetPx * 2
        ctx.beginPath()
        ctx.arc(aimX, aimY, 6, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,183,77,0.85)'
        ctx.fill()
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        // Simple dashed line between markers in 'ready' state
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(hx, hy)
        ctx.strokeStyle = 'rgba(76,175,80,0.5)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 4])
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Target zone
      ctx.beginPath()
      ctx.arc(hx, hy, 16, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(76,175,80,0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])

      // Hole marker
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2)
      ctx.fillStyle = '#1a1a1a'; ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.beginPath(); ctx.moveTo(hx, hy - 9); ctx.lineTo(hx, hy - 37)
      ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(hx, hy - 37); ctx.lineTo(hx + 12, hy - 30); ctx.lineTo(hx, hy - 23)
      ctx.closePath(); ctx.fillStyle = '#ef4444'; ctx.fill()
    }

    // Ball marker
    ctx.shadowColor = 'rgba(255,255,255,0.5)'
    ctx.shadowBlur = 8
    ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2)
    ctx.fillStyle = 'white'; ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.stroke()

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    if (cameraState !== 'ready') return
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [cameraState, draw])

  function haptic() {
    if ('vibrate' in navigator) navigator.vibrate(10)
  }

  function getPosition(clientX: number, clientY: number) {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    }
  }

  function handleTap(clientX: number, clientY: number) {
    if (placingState === 'analyzing' || placingState === 'done') return
    const pos = getPosition(clientX, clientY)
    if (!pos) return
    haptic()
    if (placingState === 'ball') {
      setBallPos(pos)
      setPlacingState('hole')
    } else if (placingState === 'hole') {
      setHolePos(pos)
      setPlacingState('ready')
    }
  }

  async function handleAnalyze() {
    if (!ballPos || !holePos || !videoRef.current) return
    haptic()
    setPlacingState('analyzing')

    // Capture video frame as JPEG base64
    const capture = document.createElement('canvas')
    capture.width = 640
    capture.height = 360
    const ctx = capture.getContext('2d')
    ctx?.drawImage(videoRef.current, 0, 0, 640, 360)
    const imageBase64 = capture.toDataURL('image/jpeg', 0.8).split(',')[1]

    try {
      const res = await fetch('/api/read-green', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64, ballPos, holePos }),
      })
      const data = await res.json()
      setAnalysis(data.analysis)
      setPlacingState('done')
      onAnalysisComplete({ ballPos, holePos, analysis: data.analysis })
    } catch {
      const fallback: GreenAnalysis = {
        breakDirection: 'straight', breakIntensity: 2, greenSpeed: 10,
        slope: 'flat', grain: 'neutral', confidence: 30,
        notes: 'Analysis failed — using defaults',
      }
      setAnalysis(fallback)
      setPlacingState('done')
      onAnalysisComplete({ ballPos, holePos, analysis: fallback })
    }
    haptic()
  }

  function handleReset() {
    haptic()
    setBallPos(null)
    setHolePos(null)
    setAnalysis(null)
    setPlacingState('ball')
    onReset()
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl bg-green-950 select-none"
        style={{ height: 340, cursor: placingState === 'done' || placingState === 'analyzing' ? 'default' : 'crosshair' }}
        onClick={e => handleTap(e.clientX, e.clientY)}
        onTouchEnd={e => {
          e.preventDefault()
          const t = e.changedTouches[0]
          handleTap(t.clientX, t.clientY)
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={340}
          className="absolute inset-0 w-full h-full"
        />

        {/* Step label */}
        {cameraState === 'ready' && (
          <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
            <span className="bg-black/50 text-green-300 text-[11px] px-3 py-1 rounded-full">
              {STEP_LABELS[placingState]}
            </span>
          </div>
        )}

        {/* Analyzing overlay */}
        {placingState === 'analyzing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-2">
            <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-green-300 text-sm font-semibold">Reading green…</span>
          </div>
        )}

        {/* Camera loading / error states */}
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

      {/* Action buttons below viewfinder */}
      {cameraState === 'ready' && (
        <div className="flex gap-2">
          {placingState === 'ready' && (
            <button
              onClick={e => { e.stopPropagation(); handleAnalyze() }}
              className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"
              style={{ minHeight: 44 }}
            >
              🔍 Analyze green
            </button>
          )}
          {(placingState === 'ready' || placingState === 'done') && (
            <button
              onClick={e => { e.stopPropagation(); handleReset() }}
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
