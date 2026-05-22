'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { GreenAnalysis } from '@/lib/types'

interface AnalysisResult {
  ballPos: { x: number; y: number }
  holePos: { x: number; y: number }
  analysis: GreenAnalysis
  distanceFt?: number
}

interface CameraViewfinderProps {
  onAnalysisComplete: (result: AnalysisResult) => void
  onReset: () => void
}

type Phase = 'ball' | 'walk' | 'athole' | 'analyzing' | 'done'
type GPS = { lat: number; lon: number }

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
}

function haversineDistanceFt(a: GPS, b: GPS): number {
  const R = 20902231 // Earth radius in feet
  const φ1 = a.lat * Math.PI / 180
  const φ2 = b.lat * Math.PI / 180
  const Δφ = (b.lat - a.lat) * Math.PI / 180
  const Δλ = (b.lon - a.lon) * Math.PI / 180
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function Reticle({ color, label }: { color: string; label: string }) {
  return (
    <svg width={64} height={72} viewBox="0 0 64 72" style={{ overflow: 'visible', pointerEvents: 'none', display: 'block' }}>
      <circle cx={32} cy={32} r={20} stroke={color} strokeWidth={2} fill={`${color}22`} />
      <line x1={32} y1={5}  x2={32} y2={15} stroke={color} strokeWidth={2} />
      <line x1={32} y1={49} x2={32} y2={59} stroke={color} strokeWidth={2} />
      <line x1={5}  y1={32} x2={15} y2={32} stroke={color} strokeWidth={2} />
      <line x1={49} y1={32} x2={59} y2={32} stroke={color} strokeWidth={2} />
      <circle cx={32} cy={32} r={3} fill={color} />
      <text x={32} y={68} textAnchor="middle" fill={color} fontSize={7}
        fontWeight="bold" letterSpacing={1.2} fontFamily="monospace">{label}</text>
    </svg>
  )
}

export default function CameraViewfinder({ onAnalysisComplete, onReset }: CameraViewfinderProps) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const rafRef     = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const ballGPSRef  = useRef<GPS | null>(null)
  const holeGPSRef  = useRef<GPS | null>(null)
  const watchIdRef  = useRef<number | null>(null)

  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'denied' | 'unavailable'>('loading')
  const [phase, setPhase] = useState<Phase>('ball')
  const [ballPos, setBallPos] = useState({ x: 0.5, y: 0.72 })
  const [walkedFt, setWalkedFt] = useState<number | null>(null)
  const [gpsAvailable, setGpsAvailable] = useState(true)
  const [analysis, setAnalysis] = useState<GreenAnalysis | null>(null)

  const stateRef = useRef({ phase, analysis })
  stateRef.current = { phase, analysis }

  const ballDragRef = useRef({ active: false, startX: 0, startY: 0, moved: false })

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
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        setCameraState('ready')
      } catch (err: unknown) {
        if (cancelled) return
        setCameraState(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unavailable')
      }
    }
    startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // GPS watch during walk phase
  useEffect(() => {
    if (phase !== 'walk') {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }
    if (!navigator.geolocation) { setGpsAvailable(false); return }

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const curr: GPS = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        holeGPSRef.current = curr
        if (ballGPSRef.current) setWalkedFt(haversineDistanceFt(ballGPSRef.current, curr))
      },
      () => setGpsAvailable(false),
      { enableHighAccuracy: true, maximumAge: 0 }
    )
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [phase])

  // Canvas draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width; const H = canvas.height
    const { phase: ps, analysis: an } = stateRef.current

    ctx.clearRect(0, 0, W, H)

    // Grid
    ctx.strokeStyle = 'rgba(76,175,80,0.18)'; ctx.lineWidth = 0.5
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo((W/5)*i, 0); ctx.lineTo((W/5)*i, H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, (H/5)*i); ctx.lineTo(W, (H/5)*i); ctx.stroke()
    }

    // Corner brackets
    ctx.strokeStyle = 'rgba(76,175,80,0.85)'; ctx.lineWidth = 2
    for (const [cx, cy, dx, dy] of [[0,0,1,1],[W,0,-1,1],[0,H,1,-1],[W,H,-1,-1]] as [number,number,number,number][]) {
      ctx.beginPath(); ctx.moveTo(cx+dx*22, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy+dy*22); ctx.stroke()
    }

    if (ps === 'done' && an) {
      // Hole-side view: hole at bottom, ball at top
      const bx = W * 0.5; const by = H * 0.12
      const hx = W * 0.5; const hy = H * 0.88

      const ddx = hx - bx; const ddy = hy - by
      const len = Math.sqrt(ddx*ddx + ddy*ddy) || 1
      const perpX = -ddy/len; const perpY = ddx/len
      const sign = an.breakDirection === 'left' ? 1 : an.breakDirection === 'right' ? -1 : 0
      const offset = an.breakIntensity * 18 * sign
      const cpx = (bx+hx)/2 + perpX*offset; const cpy = (by+hy)/2 + perpY*offset

      // Slope arrows on grid
      if (an.slope !== 'flat') {
        const ss = an.slope === 'downhill' ? 1 : -1
        const lf = an.breakDirection === 'left' ? 0.4 : an.breakDirection === 'right' ? -0.4 : 0
        const rX = (ddx/len)*ss + perpX*lf; const rY = (ddy/len)*ss + perpY*lf
        const rL = Math.sqrt(rX*rX+rY*rY)||1
        const aX = (rX/rL)*7; const aY = (rY/rL)*7
        const ha = Math.atan2(aY, aX)
        ctx.strokeStyle = 'rgba(76,175,80,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([])
        for (let gi = 1; gi <= 4; gi++) for (let gj = 1; gj <= 4; gj++) {
          const ix = (W/5)*gi; const iy = (H/5)*gj; const tx = ix+aX; const ty = iy+aY
          ctx.beginPath(); ctx.moveTo(ix-aX*0.6, iy-aY*0.6); ctx.lineTo(tx, ty); ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(tx,ty); ctx.lineTo(tx-4*Math.cos(ha-0.45), ty-4*Math.sin(ha-0.45))
          ctx.moveTo(tx,ty); ctx.lineTo(tx-4*Math.cos(ha+0.45), ty-4*Math.sin(ha+0.45))
          ctx.stroke()
        }
      }

      // Speed corridor
      ctx.beginPath(); ctx.moveTo(hx,hy); ctx.quadraticCurveTo(cpx,cpy,bx,by)
      ctx.strokeStyle='rgba(76,175,80,0.05)'; ctx.lineWidth=50; ctx.setLineDash([]); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(hx,hy); ctx.quadraticCurveTo(cpx,cpy,bx,by)
      ctx.strokeStyle='rgba(76,175,80,0.08)'; ctx.lineWidth=28; ctx.stroke()

      // Glow
      ctx.beginPath(); ctx.moveTo(hx,hy); ctx.quadraticCurveTo(cpx,cpy,bx,by)
      ctx.strokeStyle='rgba(76,175,80,0.22)'; ctx.lineWidth=8; ctx.stroke()

      // Gradient path (hole → ball: green → white)
      const grad = ctx.createLinearGradient(hx,hy,bx,by)
      grad.addColorStop(0, 'rgba(76,175,80,0.95)')
      grad.addColorStop(0.6, 'rgba(180,230,180,0.95)')
      grad.addColorStop(1, 'rgba(255,255,255,0.95)')
      ctx.beginPath(); ctx.moveTo(hx,hy); ctx.quadraticCurveTo(cpx,cpy,bx,by)
      ctx.strokeStyle=grad; ctx.lineWidth=2.5; ctx.setLineDash([9,5]); ctx.stroke(); ctx.setLineDash([])

      // Chevrons
      for (const t of [0.28, 0.58]) {
        const ax=(1-t)*(1-t)*hx+2*(1-t)*t*cpx+t*t*bx; const ay=(1-t)*(1-t)*hy+2*(1-t)*t*cpy+t*t*by
        const t2=Math.min(t+0.02,1)
        const ax2=(1-t2)*(1-t2)*hx+2*(1-t2)*t2*cpx+t2*t2*bx; const ay2=(1-t2)*(1-t2)*hy+2*(1-t2)*t2*cpy+t2*t2*by
        ctx.save(); ctx.translate(ax,ay); ctx.rotate(Math.atan2(ay2-ay,ax2-ax))
        ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=2
        ctx.beginPath(); ctx.moveTo(-7,-4); ctx.lineTo(0,0); ctx.lineTo(-7,4); ctx.stroke()
        ctx.restore()
      }

      // Aim point crosshair
      const aimX = hx + perpX*(an.breakIntensity*6*sign)*2
      const aimY = hy + perpY*(an.breakIntensity*6*sign)*2
      ctx.beginPath(); ctx.arc(aimX,aimY,13,0,Math.PI*2)
      ctx.strokeStyle='rgba(255,183,77,0.35)'; ctx.lineWidth=1; ctx.stroke()
      ctx.beginPath(); ctx.arc(aimX,aimY,6,0,Math.PI*2)
      ctx.fillStyle='rgba(255,183,77,0.9)'; ctx.fill(); ctx.strokeStyle='white'; ctx.lineWidth=1.5; ctx.stroke()
      ctx.strokeStyle='rgba(255,183,77,0.75)'; ctx.lineWidth=1.5
      for (const [x1,y1,x2,y2] of [
        [aimX,aimY-17,aimX,aimY-12],[aimX,aimY+12,aimX,aimY+17],
        [aimX-17,aimY,aimX-12,aimY],[aimX+12,aimY,aimX+17,aimY],
      ] as [number,number,number,number][]) {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
      }

      // Ball marker (top)
      ctx.shadowColor='rgba(255,255,255,0.5)'; ctx.shadowBlur=8
      ctx.beginPath(); ctx.arc(bx,by,8,0,Math.PI*2)
      ctx.fillStyle='white'; ctx.fill(); ctx.shadowBlur=0
      ctx.strokeStyle='#333'; ctx.lineWidth=1.5; ctx.stroke()

      // Hole ring (bottom)
      ctx.beginPath(); ctx.arc(hx,hy,20,0,Math.PI*2)
      ctx.strokeStyle='rgba(76,175,80,0.5)'; ctx.lineWidth=1.5; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([])
      ctx.beginPath(); ctx.arc(hx,hy,8,0,Math.PI*2)
      ctx.fillStyle='#111'; ctx.fill(); ctx.strokeStyle='white'; ctx.lineWidth=1.5; ctx.stroke()
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
    if (!ballDragRef.current.moved) {
      haptic()
      setPhase('walk')
      // Record GPS at ball in background — watchPosition in 'walk' phase starts immediately
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          p => { ballGPSRef.current = { lat: p.coords.latitude, lon: p.coords.longitude } },
          () => setGpsAvailable(false),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        )
      } else {
        setGpsAvailable(false)
      }
    }
  }

  function handleAtHole() {
    haptic()
    // holeGPSRef.current is already being updated by watchPosition
    setPhase('athole')
  }

  async function handleCapture() {
    if (!videoRef.current) return
    haptic()
    setPhase('analyzing')

    // Final GPS snapshot at hole
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
      : undefined

    const capture = document.createElement('canvas')
    capture.width = 640; capture.height = 360
    capture.getContext('2d')?.drawImage(videoRef.current, 0, 0, 640, 360)
    const imageBase64 = capture.toDataURL('image/jpeg', 0.8).split(',')[1]

    // In hole-side view, hole = bottom of frame
    const holePos = { x: 0.5, y: 0.9 }

    try {
      const res = await fetch('/api/read-green', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64, ballPos, holePos, distanceFt, perspective: 'from_hole' }),
      })
      const data = await res.json()
      setAnalysis(data.analysis)
      setPhase('done')
      onAnalysisComplete({ ballPos, holePos, analysis: data.analysis, distanceFt })
    } catch {
      const fallback: GreenAnalysis = {
        breakDirection: 'straight', breakIntensity: 2, greenSpeed: 10,
        slope: 'flat', grain: 'neutral', confidence: 30,
        notes: 'Analysis failed — using defaults',
      }
      setAnalysis(fallback)
      setPhase('done')
      onAnalysisComplete({ ballPos, holePos, analysis: fallback, distanceFt })
    }
    haptic()
  }

  function handleReset() {
    haptic()
    setBallPos({ x: 0.5, y: 0.72 })
    setWalkedFt(null)
    setGpsAvailable(true)
    setAnalysis(null)
    ballGPSRef.current = null
    holeGPSRef.current = null
    setPhase('ball')
    onReset()
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Camera viewfinder — always mounted so stream stays alive */}
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-2xl bg-green-950 select-none${phase === 'walk' ? ' hidden' : ''}`}
        style={{ height: 340 }}
      >
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} width={640} height={340} className="absolute inset-0 w-full h-full" />

        {/* Ball reticle */}
        {cameraState === 'ready' && phase === 'ball' && (
          <div
            className="animate-pulse"
            style={{
              position: 'absolute', left: `${ballPos.x * 100}%`, top: `${ballPos.y * 100}%`,
              transform: 'translate(-50%, -50%)', cursor: 'grab', touchAction: 'none', userSelect: 'none',
            }}
            onPointerDown={onBallPointerDown}
            onPointerMove={onBallPointerMove}
            onPointerUp={onBallPointerUp}
          >
            <Reticle color="white" label="BALL" />
          </div>
        )}

        {/* Step label */}
        {cameraState === 'ready' && (phase === 'ball' || phase === 'athole') && (
          <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
            <span className="bg-black/60 text-white text-[11px] px-3 py-1 rounded-full tracking-wide">
              {phase === 'ball' && 'Drag reticle to your ball · tap to place'}
              {phase === 'athole' && 'Point camera at the green · tap Capture'}
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

      {/* Walk-to-hole card */}
      {phase === 'walk' && (
        <div className="bg-green-900 rounded-2xl px-5 py-7 flex flex-col items-center gap-4">
          <div className="text-5xl">🚶</div>
          <div className="text-center">
            <h3 className="text-white font-bold text-base">Walk to the hole</h3>
            <p className="text-green-400 text-xs mt-1">Reading from hole side gives a better green read</p>
          </div>
          {walkedFt !== null ? (
            <div className="bg-green-800 rounded-xl px-5 py-2.5 flex items-center gap-2">
              <span className="text-green-400 text-xs">Distance</span>
              <span className="text-green-200 font-bold font-mono text-lg">{walkedFt.toFixed(1)} ft</span>
            </div>
          ) : gpsAvailable ? (
            <div className="flex items-center gap-2 text-green-500 text-xs">
              <div className="w-3 h-3 border border-green-500 border-t-transparent rounded-full animate-spin" />
              Acquiring GPS…
            </div>
          ) : (
            <p className="text-green-600 text-xs">GPS unavailable — distance will be estimated</p>
          )}
          <button
            onClick={handleAtHole}
            className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"
            style={{ minHeight: 44 }}
          >
            I'm at the hole →
          </button>
        </div>
      )}

      {/* Action buttons */}
      {cameraState === 'ready' && (phase === 'athole' || phase === 'done') && (
        <div className="flex gap-2">
          {phase === 'athole' && (
            <button
              onClick={handleCapture}
              className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"
              style={{ minHeight: 44 }}
            >
              🔍 Capture & analyze
            </button>
          )}
          {phase === 'done' && (
            <button
              onClick={handleReset}
              className="flex-1 py-3 px-4 rounded-xl border border-green-700 text-green-400 text-sm font-semibold hover:bg-green-900 transition-colors"
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
