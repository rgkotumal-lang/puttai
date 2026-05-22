'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'puttai_green_speed'

const PRESETS = [
  { stimp: 7,  label: 'Slow',        emoji: '🐢', desc: 'Wet / shaggy greens' },
  { stimp: 9,  label: 'Medium',      emoji: '🌿', desc: 'Average course' },
  { stimp: 11, label: 'Medium-fast', emoji: '⚡', desc: 'Well-maintained' },
  { stimp: 13, label: 'Fast',        emoji: '🚀', desc: 'Tournament prep' },
]

interface GreenSpeedPickerProps {
  onChange: (stimp: number) => void
}

export default function GreenSpeedPicker({ onChange }: GreenSpeedPickerProps) {
  const [selected, setSelected] = useState<number>(10)
  const [custom, setCustom] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const v = parseInt(stored, 10)
      if (v >= 6 && v <= 14) { setSelected(v); onChange(v) }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pick(stimp: number) {
    setSelected(stimp)
    setCustom(false)
    localStorage.setItem(STORAGE_KEY, String(stimp))
    onChange(stimp)
  }

  function handleCustom(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value, 10)
    if (isNaN(v)) return
    const clamped = Math.min(14, Math.max(6, v))
    setSelected(clamped)
    localStorage.setItem(STORAGE_KEY, String(clamped))
    onChange(clamped)
  }

  return (
    <div className="bg-green-900 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[11px] text-green-500 uppercase tracking-wider">Green speed</h3>
        <button
          onClick={() => setCustom(c => !c)}
          className="text-[10px] text-green-400 underline underline-offset-2"
        >
          {custom ? 'presets' : `stimp ${selected} — custom`}
        </button>
      </div>

      {custom ? (
        <div className="flex items-center gap-3">
          <span className="text-green-500 text-xs">Stimp</span>
          <input
            type="number"
            min={6}
            max={14}
            value={selected}
            onChange={handleCustom}
            className="w-16 bg-green-800 text-green-200 text-sm font-bold rounded-lg px-2 py-1 text-center border border-green-700 focus:outline-none focus:border-green-500"
          />
          <span className="text-green-500 text-xs">6 – 14</span>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p.stimp}
              onClick={() => pick(p.stimp)}
              className={`flex flex-col items-center py-2 px-1 rounded-lg text-center transition-colors ${
                selected === p.stimp
                  ? 'bg-green-600 text-white'
                  : 'bg-green-800 text-green-400 hover:bg-green-700'
              }`}
            >
              <span className="text-base leading-none mb-0.5">{p.emoji}</span>
              <span className="text-[9px] font-bold leading-tight">{p.label}</span>
              <span className="text-[8px] text-green-400 leading-tight mt-0.5">{p.stimp}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
