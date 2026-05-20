'use client'

interface BarChartProps {
  data: { distance: number; rate: number }[]
  currentDistance?: number
}

export default function BarChart({ data, currentDistance }: BarChartProps) {
  return (
    <div className="bg-green-900 rounded-xl p-4">
      <h3 className="text-[11px] text-green-400 uppercase tracking-wider mb-3">Make % by distance</h3>
      <div className="flex items-end gap-1.5 h-28">
        {data.map(({ distance, rate }) => {
          const isCurrent =
            currentDistance !== undefined && Math.abs(currentDistance - distance) < 2
          const height = Math.max(rate * 100, 2)
          return (
            <div key={distance} className="flex flex-col items-center flex-1">
              <span className="text-[9px] text-green-400 mb-0.5">
                {rate > 0 ? `${Math.round(rate * 100)}%` : ''}
              </span>
              <div className="w-full rounded-t-sm" style={{ height: `${height}%` }}>
                <div
                  className={`w-full h-full rounded-t-sm ${isCurrent ? 'bg-green-400' : 'bg-green-600'}`}
                />
              </div>
              <span className="text-[9px] text-green-500 mt-1">
                {distance === 20 ? '20+' : `${distance}ft`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
