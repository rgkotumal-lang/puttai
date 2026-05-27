'use client'

import { useState, useRef, useEffect } from 'react'
import TipCard from '@/components/ui/TipCard'
import { getLastPutt, saveShotResult, getAllResults, getAllPutts } from '@/lib/storage'
import { speedLabel } from '@/lib/calculations'
import { CoachingTip, ShotResult } from '@/lib/types'

interface ReviewScreenProps {
  onNavigateToAim: () => void
}

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
}

type Phase = 'capture' | 'preview' | 'analyzing' | 'result'

export default function ReviewScreen({ onNavigateToAim }: ReviewScreenProps) {
  const [phase, setPhase] = useState<Phase>('capture')
  const [capturedImage, setCapturedImage] = useState('')
  const [result, setResult] = useState<ShotResult | null>(null)
  const [offlineMode, setOfflineMode] = useState(false)
  const [cameraError, setCameraError] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const putt = getLastPutt()
  const allPutts = getAllPutts()

  useEffect(() => {
    if (phase !== 'capture') return

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
      } catch {
        setCameraError(true)
      }
    }

    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [phase])

  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d')?.drawImage(video, 0, 0)

    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
    setCapturedImage(base64)
    setPhase('preview')
    haptic()
  }

  async function analyze() {
    if (!putt) return
    setPhase('analyzing')

    const newResult: ShotResult = {
      puttId: putt.id,
      actualX: 0.5,
      actualY: 0.5,
      missDistanceInches: 0,
      missDirection: 'made',
      tips: [],
    }

    try {
      const res = await fetch('/api/analyze-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: capturedImage, putt }),
      })
      const data = await res.json()
      newResult.missDistanceInches = data.missDistanceInches ?? 0
      newResult.missDirection = data.missDirection ?? 'made'
      newResult.tips = (data.tips as CoachingTip[]).map((t, i) => ({
        ...t,
        id: t.id ?? String(i + 1),
      }))
      if (data.error) setOfflineMode(true)
    } catch {
      setOfflineMode(true)
      newResult.tips = [{
        id: '1',
        type: 'info',
        title: 'Offline mode',
        body: 'AI analysis unavailable. Check your connection and try again on your next putt.',
      }]
    }

    saveShotResult(newResult)
    setResult(newResult)
    setPhase('result')
    haptic()
  }

  // ——— Capture phase ———
  if (phase === 'capture') {
    return (
      <div className="flex flex-col gap-4 pb-2">
        <div>
          <h2 className="text-lg font-bold text-green-300">Capture result</h2>
          <p className="text-[12px] text-green-500">
            Point camera at the hole — show where your ball stopped
          </p>
        </div>

        {cameraError ? (
          <div className="bg-green-900 rounded-2xl px-5 py-8 text-center">
            <p className="text-green-400 text-sm mb-4">Camera unavailable on this device</p>
            <button
              onClick={() => { setCameraError(false); setPhase('capture') }}
              className="text-green-500 text-sm underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
            {/* Guide reticle — center on the hole */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-white opacity-70" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white opacity-40 -translate-x-1/2" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white opacity-40 -translate-y-1/2" />
              </div>
            </div>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
              <span className="text-white text-[11px] bg-black/60 px-3 py-1 rounded-full">
                Center the hole in the circle
              </span>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <button
          onClick={capture}
          disabled={cameraError}
          className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold text-base transition-colors disabled:opacity-40"
          style={{ minHeight: 44 }}
        >
          📸 Capture result
        </button>
      </div>
    )
  }

  // ——— Preview phase ———
  if (phase === 'preview') {
    return (
      <div className="flex flex-col gap-4 pb-2">
        <div>
          <h2 className="text-lg font-bold text-green-300">Confirm photo</h2>
          <p className="text-[12px] text-green-500">
            Does this clearly show the hole and where your ball stopped?
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${capturedImage}`}
            alt="Captured result"
            className="w-full object-cover"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setCapturedImage(''); setPhase('capture') }}
            className="flex-1 py-3 rounded-xl border border-green-700 text-green-400 font-semibold text-sm transition-colors hover:bg-green-900"
            style={{ minHeight: 44 }}
          >
            Retake
          </button>
          <button
            onClick={analyze}
            className="flex-[2] py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors"
            style={{ minHeight: 44 }}
          >
            Analyze result
          </button>
        </div>
      </div>
    )
  }

  // ——— Analyzing phase ———
  if (phase === 'analyzing') {
    return (
      <div className="flex flex-col gap-4 pb-2">
        <h2 className="text-lg font-bold text-green-300">Analyzing shot…</h2>
        {capturedImage && (
          <div className="rounded-2xl overflow-hidden bg-black opacity-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/jpeg;base64,${capturedImage}`} alt="" className="w-full object-cover" />
          </div>
        )}
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-green-400 text-sm">Reading your result with AI…</span>
        </div>
      </div>
    )
  }

  // ——— Result phase ———
  if (!result || !putt) return null

  const made = result.missDirection === 'made'
  const allResults = getAllResults()
  const puttNumber = allResults.length

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

      {/* Captured photo thumbnail */}
      {capturedImage && (
        <div className="rounded-xl overflow-hidden" style={{ maxHeight: 140 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${capturedImage}`}
            alt="Result"
            className="w-full object-cover"
          />
        </div>
      )}

      <div className={`rounded-xl px-4 py-4 text-center ${made ? 'bg-green-800' : 'bg-green-900 border border-green-700'}`}>
        {made ? (
          <span className="text-green-300 font-bold text-xl">🎯 Made it!</span>
        ) : (
          <span className="text-green-200 font-semibold text-base">
            Missed{' '}
            <span className="text-amber-400 font-bold">{result.missDistanceInches.toFixed(1)}"</span>
            {' '}<span className="capitalize text-green-400">{result.missDirection}</span>
          </span>
        )}
      </div>

      {/* Putt conditions */}
      <div className="bg-green-900 rounded-xl px-4 py-3">
        <h3 className="text-[11px] text-green-500 uppercase tracking-wider mb-2">Putt conditions</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <span className="text-[12px] text-green-500">Distance</span>
          <span className="text-[13px] font-semibold text-green-300">{putt.distance.toFixed(1)} ft</span>
          <span className="text-[12px] text-green-500">Green speed</span>
          <span className="text-[13px] font-semibold text-green-300">
            stimp {putt.confirmedGreenSpeed ?? putt.greenSpeed} — {speedLabel(putt.confirmedGreenSpeed ?? putt.greenSpeed)}
          </span>
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

      {/* Session history */}
      {allPutts.length > 1 && (
        <div className="bg-green-900 rounded-xl px-4 py-3">
          <h3 className="text-[11px] text-green-500 uppercase tracking-wider mb-2">
            Session ({allPutts.length} putts)
          </h3>
          <div className="flex flex-col gap-1.5">
            {[...allPutts].reverse().map((p, i) => {
              const r = allResults.find(r => r.puttId === p.id)
              const isMade = r?.missDirection === 'made'
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
                    <span className={`text-[11px] font-semibold ${isMade ? 'text-green-400' : 'text-amber-400'}`}>
                      {isMade ? 'Made' : `${r.missDistanceInches.toFixed(0)}" ${r.missDirection}`}
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
        onClick={() => { haptic(); onNavigateToAim() }}
        className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold text-base transition-colors"
        style={{ minHeight: 44 }}
      >
        📸 Next putt
      </button>
    </div>
  )
}
