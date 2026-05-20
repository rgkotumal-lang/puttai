'use client'

import { useState, useEffect } from 'react'
import AimScreen from '@/components/screens/AimScreen'
import ReviewScreen from '@/components/screens/ReviewScreen'
import StatsScreen from '@/components/screens/StatsScreen'
import Modal from '@/components/ui/Modal'

type Tab = 'aim' | 'review' | 'stats'

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'aim', label: 'Aim', icon: '📸' },
  { id: 'review', label: 'Review', icon: '📊' },
  { id: 'stats', label: 'Stats', icon: '📈' },
]

const onboardingSteps = [
  { icon: '📸', title: 'Set up your putt', body: 'Tap the viewfinder to position the ball marker, then adjust green speed and break.' },
  { icon: '🏌️', title: 'Take the shot', body: 'Putt, then tap "Shot taken" to start AI analysis.' },
  { icon: '🎯', title: 'Mark the result', body: 'On the Review tab, tap where your ball stopped. Get instant coaching tips.' },
]

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('aim')
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('puttai_onboarded')) {
      setShowOnboarding(true)
    }
  }, [])

  function dismissOnboarding() {
    localStorage.setItem('puttai_onboarded', '1')
    setShowOnboarding(false)
  }

  return (
    <div className="flex flex-col min-h-screen bg-green-950 max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-green-900 border-b border-green-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">⛳</span>
          <span className="font-bold text-green-300 text-lg tracking-tight">PuttAI</span>
        </div>
        <div className="flex items-center gap-1.5 bg-green-800 px-2.5 py-1 rounded-full">
          <span className="text-xs">🔥</span>
          <span className="text-[11px] text-green-300 font-semibold">7-day streak</span>
        </div>
      </header>

      {/* Screen area */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24" key={activeTab}>
        <div className="screen-enter">
          {activeTab === 'aim' && (
            <AimScreen onNavigateToReview={() => setActiveTab('review')} />
          )}
          {activeTab === 'review' && (
            <ReviewScreen onNavigateToAim={() => setActiveTab('aim')} />
          )}
          {activeTab === 'stats' && <StatsScreen />}
        </div>
      </main>

      {/* Tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-green-900 border-t border-green-800">
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-semibold transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-green-400 border-green-400'
                  : 'text-green-600 border-transparent hover:text-green-500'
              }`}
              style={{ minHeight: 56 }}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[10px]">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Onboarding modal */}
      <Modal open={showOnboarding} onClose={dismissOnboarding}>
        <div className="text-center mb-4">
          <span className="text-4xl">⛳</span>
          <h2 className="text-green-300 font-bold text-xl mt-2">Welcome to PuttAI</h2>
          <p className="text-green-500 text-[12px] mt-1">Your AI-powered putting coach</p>
        </div>
        <div className="flex flex-col gap-3 mb-5">
          {onboardingSteps.map((step, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-green-800 flex items-center justify-center flex-shrink-0 text-lg">
                {step.icon}
              </div>
              <div>
                <p className="text-green-300 text-sm font-semibold">{step.title}</p>
                <p className="text-green-500 text-[11px] leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={dismissOnboarding}
          className="w-full py-3 rounded-xl bg-green-600 text-white font-bold text-sm"
          style={{ minHeight: 44 }}
        >
          Get started
        </button>
      </Modal>
    </div>
  )
}
