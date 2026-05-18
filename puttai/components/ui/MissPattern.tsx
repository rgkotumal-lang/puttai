'use client'

interface MissPatternProps {
  points: { x: number; y: number; made: boolean }[]
  dominantMiss: string
}

export default function MissPattern({ points, dominantMiss }: MissPatternProps) {
  const cx = 150
  const cy = 70

  return (
    <div className="bg-green-900 rounded-xl p-4">
      <h3 className="text-[11px] text-green-400 uppercase tracking-wider mb-3">Miss pattern</h3>
      <svg width="300" height="140" viewBox="0 0 300 140" className="w-full">
        {[18, 36, 54].map((r, i) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#2d5a2d"
            strokeWidth="1"
            strokeDasharray={i === 0 ? 'none' : '3 3'}
          />
        ))}
        <circle cx={cx} cy={cy} r={5} fill="#1a3a1a" stroke="#4caf50" strokeWidth="1.5" />
        {[6, 12, 18].map((inches, i) => (
          <text
            key={inches}
            x={cx + 4}
            y={cy - [18, 36, 54][i] + 3}
            fontSize="7"
            fill="#2d5a2d"
          >
            {inches}"
          </text>
        ))}
        {points.slice(-30).map((p, i) => {
          const px = cx + (p.x - 0.447) * 120
          const py = cy + (p.y - 0.147) * 120
          return (
            <circle
              key={i}
              cx={px}
              cy={py}
              r={3}
              fill={p.made ? '#4caf50' : '#ffb74d'}
              opacity={0.8}
            />
          )
        })}
      </svg>
      {dominantMiss !== 'none' && (
        <p className="text-[11px] text-green-400 mt-2 text-center">
          Dominant miss: <span className="text-gold font-semibold capitalize">{dominantMiss}</span>
        </p>
      )}
    </div>
  )
}
