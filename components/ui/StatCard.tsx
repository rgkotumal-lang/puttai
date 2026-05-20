'use client'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | 'neutral'
}

export default function StatCard({ label, value, sub, trend }: StatCardProps) {
  const trendColor =
    trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-green-500'

  return (
    <div className="bg-green-900 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-[11px] text-green-400 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${trendColor}`}>{value}</span>
      {sub && <span className="text-[11px] text-green-500">{sub}</span>}
    </div>
  )
}
