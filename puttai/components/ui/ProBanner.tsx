'use client'

export default function ProBanner() {
  return (
    <div
      className="rounded-xl p-4 mt-4"
      style={{ background: 'linear-gradient(135deg, #1a3a1a 0%, #2d5a2d 100%)' }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">🏆</span>
        <div className="flex-1">
          <h3 className="text-green-300 font-bold text-sm mb-1">Unlock Pro</h3>
          <p className="text-[11px] text-green-400 leading-relaxed mb-3">
            Stroke analysis video overlays, caddie-mode voice tips, handicap tracking, and
            unlimited round history.
          </p>
          <a
            href="mailto:hello@puttai.com?subject=Pro Interest"
            className="inline-block text-[12px] font-semibold text-green-950 bg-green-400 px-4 py-1.5 rounded-full"
          >
            Try free →
          </a>
        </div>
      </div>
    </div>
  )
}
