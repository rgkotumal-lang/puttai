'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface CameraViewfinderProps {
  breakDirection: 'left' | 'right' | 'straight'
  breakIntensity: number
  greenSpeed: number
  onBallPositionChange: (pos: { x: number; y: number }) => void
}

const HOLE = { x: 0.447, y: 0.147 }

export default function CameraViewfinder({
  breakDirection,
  breakIntensity,
  greenSpeed,
  onBallPositionChange,
}: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const [ballPos, setBallPos] = useState({ x: 0.5, y: 0.78 })
  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'denied' | 'unavailable'>('loading')

  const ballPosRef = useRef(ballPos)
  ballPosRef.current = ballPos

  const breakRef = useRef({ breakDirection, breakIntensity, greenSpeed })
  breakRef.current = { breakDirection, breakIntensity, greenSpeed }

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraState('ready')
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setCameraState('denied')
        } else {
          setCameraState('unavailable')
        }
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
    ctx.clearRect(0, 0, W, H)

    // Grid
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.2)'
    ctx.lineWidth = 0.5
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath()
      ctx.moveTo((W / 5) * i, 0)
      ctx.lineTo((W / 5) * i, H)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, (H / 5) * i)
      ctx.lineTo(W, (H / 5) * i)
      ctx.stroke()
    }

    // Corner brackets
    const B = 20
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.8)'
    ctx.lineWidth = 2
    const corners = [
      [0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1],
    ] as [number, number, number, number][]
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath()
      ctx.moveTo(cx + dx * B, cy)
      ctx.lineTo(cx, cy)
      ctx.lineTo(cx, cy + dy * B)
      ctx.stroke()
    }

    const ball = ballPosRef.current
    const bx = ball.x * W
    const by = ball.y * H
    const hx = HOLE.x * W
    const hy = HOLE.y * H

    const { breakDirection: bd, breakIntensity: bi } = breakRef.current
    const cpOffsetX = bd === 'left' ? -bi * 18 : bd === 'right' ? bi * 18 : 0
    const cpOffsetY = 0
    const cpx = (bx + hx) / 2 + cpOffsetX
    const cpy = (by + hy) / 2 + cpOffsetY

    // Glow path
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.quadraticCurveTo(cpx, cpy, hx, hy)
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.25)'
    ctx.lineWidth = 6
    ctx.setLineDash([])
    ctx.stroke()

    // Main path
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.quadraticCurveTo(cpx, cpy, hx, hy)
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.9)'
    ctx.lineWidth = 2.5
    ctx.setLineDash([8, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Arrow chevrons at 33% and 66%
    for (const t of [0.33, 0.66]) {
      const ax = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * cpx + t * t * hx
      const ay = (1 - t) * (1 - t) * by + 2 * (1 - t) * t * cpy + t * t * hy
      const dt = 0.02
      const t2 = Math.min(t + dt, 1)
      const ax2 = (1 - t2) * (1 - t2) * bx + 2 * (1 - t2) * t2 * cpx + t2 * t2 * hx
      const ay2 = (1 - t2) * (1 - t2) * by + 2 * (1 - t2) * t2 * cpy + t2 * t2 * hy
      const angle = Math.atan2(ay2 - ay, ax2 - ax)
      ctx.save()
      ctx.translate(ax, ay)
      ctx.rotate(angle)
      ctx.strokeStyle = 'rgba(76, 175, 80, 0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(-5, -4)
      ctx.lineTo(0, 0)
      ctx.lineTo(-5, 4)
      ctx.stroke()
      ctx.restore()
    }

    // Target zone around hole
    ctx.beginPath()
    ctx.arc(hx, hy, 16, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.6)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.stroke()
    ctx.setLineDash([])

    // Hole marker
    ctx.beginPath()
    ctx.arc(hx, hy, 9, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Flag pole
    ctx.beginPath()
    ctx.moveTo(hx, hy - 9)
    ctx.lineTo(hx, hy - 37)
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 2
    ctx.stroke()
    // Flag triangle
    ctx.beginPath()
    ctx.moveTo(hx, hy - 37)
    ctx.lineTo(hx + 12, hy - 30)
    ctx.lineTo(hx, hy - 23)
    ctx.closePath()
    ctx.fillStyle = '#ef4444'
    ctx.fill()

    // Ball marker
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(bx, by, 8, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1.5
    ctx.stroke()

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

  function handleInteraction(clientX: number, clientY: number) {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const newPos = { x, y }
    setBallPos(newPos)
    onBallPositionChange(newPos)
    haptic()
  }

  function handleClick(e: React.MouseEvent) {
    handleInteraction(e.clientX, e.clientY)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    e.preventDefault()
    const touch = e.changedTouches[0]
    handleInteraction(touch.clientX, touch.clientY)
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl bg-green-950 cursor-crosshair select-none"
      style={{ height: 340 }}
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
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

      {cameraState === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-950/80 gap-2">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-green-400 text-sm">Starting camera…</span>
        </div>
      )}

      {cameraState === 'denied' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-950/90 gap-3 px-6 text-center">
          <span className="text-3xl">📷</span>
          <p className="text-green-300 text-sm font-semibold">Camera permission denied</p>
          <p className="text-green-500 text-xs">
            Allow camera access in your browser settings and reload the page.
          </p>
        </div>
      )}

      {cameraState === 'unavailable' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-950/90 gap-3 px-6 text-center">
          <span className="text-3xl">⛳</span>
          <p className="text-green-300 text-sm font-semibold">Camera unavailable</p>
          <p className="text-green-500 text-xs">
            No camera detected. Open on a mobile device for the full experience.
          </p>
        </div>
      )}
    </div>
  )
}
