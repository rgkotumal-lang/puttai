'use client'

import { CoachingTip } from '@/lib/types'

const typeConfig = {
  error: { border: '#ef4444', icon: '⚠️', label: 'ERROR' },
  warning: { border: '#ffb74d', icon: '🎯', label: 'WARNING' },
  success: { border: '#4caf50', icon: '✅', label: 'GREAT' },
  info: { border: '#64b5f6', icon: '📐', label: 'TIP' },
}

export default function TipCard({ tip }: { tip: CoachingTip }) {
  const cfg = typeConfig[tip.type] ?? typeConfig.info

  return (
    <div
      style={{ borderLeftColor: cfg.border }}
      className="bg-green-900 border-l-[3px] rounded-r-lg px-3 py-2.5 mb-2"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{cfg.icon}</span>
        <span
          style={{ color: cfg.border }}
          className="text-[11px] font-bold tracking-widest uppercase"
        >
          {cfg.label}
        </span>
      </div>
      <p className="text-sm font-semibold text-green-100 mb-1">{tip.title}</p>
      <p className="text-[13px] text-green-300 leading-relaxed">{tip.body}</p>
    </div>
  )
}
