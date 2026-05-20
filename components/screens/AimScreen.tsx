'use client'

import { useState } from 'react'
import CameraViewfinder from '@/components/ui/CameraViewfinder'
import { calcDistance, calcAimOffset, speedLabel } from '@/lib/calculations'
import { savePutt, generateId, getAllPutts } from '@/lib/storage'
import { GreenAnalysis } from '@/lib/types'

interface AimScreenProps {
  onNavigateToReview: () => void
}

interface AnalysisResult {
  ballPos: { x: number; y: number }
  holePos: { x: number; y: number }
  analysis: GreenAnalysis
}

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
}

const intensityLabels = ['Subtle', 'Gentle', 'Medium', 'Strong', 'Sharp']

export default function AimScreen({ onNavigateToReview }: AimScreenProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [saving, setSaving] = useState(false)

  function handleAnalysisComplete(data: AnalysisResult) {
    setResult(data)
  }

  function handleReset() {
    setResult(null)
  }

  function handleShot() {
    if (!result) return
    haptic()
    setSaving(true)
    const { ballPos, holePos, analysis } = result
    const distance = calcDistance(ballPos.x, ballPos.y, holePos.x, holePos.y)
    const aimOffsetInches = calcAimOffset(analysis.breakDirection, analysis.breakIntensity)
    const putt = {
      id: generateId(),
      timestamp: Date.now(),
      holeNumber: getAllPutts().length + 1,
      distance,
      breakDirection: analysis.breakDirection,
      breakIntensity: analysis.breakIntensity,
      greenSpeed: analysis.greenSpeed,
      slope: analysis.slope,
      grain: analysis.grain,
      aimOffsetInches,
      targetX: holePos.x,
      targetY: holePos.y,
      ballX: ballPos.x,
      ballY: ballPos.y,
    }
    savePutt(putt)
    setSaving(false)
    onNavigateToReview()
  }

  const distance = result
    ? calcDistance(result.ballPos.x, result.ballPos.y, result.holePos.x, result.holePos.y)
    : null
  const aimOffsetInches = result
    ? calcAimOffset(result.analysis.breakDirection, result.analysis.breakIntensity)
    : null

  return (
    <div className="flex flex-col gap-4 pb-2">
      <CameraViewfinder
        onAnalysisComplete={handleAnalysisComplete}
        onReset={handleReset}
      />

      {!result && (
        <div className="bg-green-900 rounded-xl px-4 py-4 text-center">
          <p className="text-green-400 text-sm">
            Mark your ball, then the hole — AI will read the break and speed for you.
          </p>
        </div>
      )}

      {result && (
        <>
          {/* AI Green Read panel */}
          <div className="bg-green-900 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] text-green-500 uppercase tracking-wider">Green read</h3>
              <span className="text-[10px] bg-green-800 text-green-400 px-2 py-0.5 rounded-full">
                AI · {result.analysis.confidence}% confidence
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <Row label="Distance" value={`${distance!.toFixed(1)} ft`} />
              <Row
                label="Aim point"
                value={
                  aimOffsetInches === 0
                    ? 'Center cup'
                    : `${Math.abs(aimOffsetInches!).toFixed(1)}" ${aimOffsetInches! > 0 ? 'left' : 'right'}`
                }
              />
              <Row
                label="Break"
                value={
                  result.analysis.breakDirection === 'straight'
                    ? 'Straight'
                    : `${intensityLabels[result.analysis.breakIntensity - 1]} ${result.analysis.breakDirection}`
                }
              />
              <Row label="Green speed" value={`${result.analysis.greenSpeed} — ${speedLabel(result.analysis.greenSpeed)}`} />
              <Row
                label="Slope"
                value={result.analysis.slope.charAt(0).toUpperCase() + result.analysis.slope.slice(1)}
              />
              <Row
                label="Grain"
                value={result.analysis.grain.charAt(0).toUpperCase() + result.analysis.grain.slice(1)}
              />
            </div>
            {result.analysis.notes && (
              <p className="text-[11px] text-green-500 mt-2 italic border-t border-green-800 pt-2">
                {result.analysis.notes}
              </p>
            )}
          </div>

          <button
            onClick={handleShot}
            disabled={saving}
            className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold text-base transition-colors disabled:opacity-60"
            style={{ minHeight: 44 }}
          >
            {saving ? 'Saving…' : '📸 Shot taken — analyze result'}
          </button>
        </>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-[12px] text-green-500">{label}</span>
      <span className="text-[13px] font-semibold text-green-300">{value}</span>
    </>
  )
}
