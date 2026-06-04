'use client'

import { useEffect, useRef } from 'react'
import type { Achievement } from '@/lib/achievements'

interface AchievementToastProps {
  achievement: Achievement | null
  onDone: () => void
}

const TOAST_MS = 3000

export function AchievementToast({ achievement, onDone }: AchievementToastProps) {
  // Keep the latest onDone in a ref so the dismiss timer depends only on the
  // achievement itself. onDone is an inline closure in the parent (new identity
  // every render); depending on it here would reset the timeout on every parent
  // re-render — which during gameplay is constant, so the toast never dismissed.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (!achievement) return
    const id = window.setTimeout(() => onDoneRef.current(), TOAST_MS)
    return () => window.clearTimeout(id)
  }, [achievement])

  if (!achievement) return null

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[70] pointer-events-none px-4 w-full max-w-md">
      <div className="bg-space-900/95 border border-hud-amber/50 rounded-lg shadow-2xl px-4 py-3 flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded border border-hud-amber/40 bg-hud-amber/10 text-hud-amber font-mono text-xs flex items-center justify-center">
          {achievement.icon}
        </div>
        <div className="min-w-0">
          <p className="text-hud-amber text-[10px] tracking-[0.24em]">ACHIEVEMENT UNLOCKED</p>
          <p className="text-white/95 text-sm font-bold mt-0.5">{achievement.title}</p>
          <p className="text-white/60 text-xs mt-1">{achievement.description}</p>
        </div>
      </div>
    </div>
  )
}
