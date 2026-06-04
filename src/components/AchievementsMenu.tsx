'use client'

import { ACHIEVEMENT_COUNT } from '@/lib/achievements'
import type { Achievement, AchievementCategory, AchievementProgress } from '@/lib/achievements'

export interface AchievementListItem {
  achievement: Achievement
  unlocked: boolean
  progress: AchievementProgress | null
}

interface AchievementsMenuProps {
  items: AchievementListItem[]
  onBack: () => void
}

const CATEGORY_ORDER: AchievementCategory[] = [
  'Foundations',
  'Loadout & Systems',
  'Mining & Economy',
  'Combat & Survival',
  'Drone Command',
  'Hidden',
]

function categoryItems(items: AchievementListItem[], category: AchievementCategory): AchievementListItem[] {
  return items.filter((item) => item.achievement.category === category)
}

export function AchievementsMenu({ items, onBack }: AchievementsMenuProps) {
  const unlockedCount = items.filter((item) => item.unlocked).length

  return (
    <div className="absolute inset-0 z-[40] bg-black/85 flex items-center justify-center p-4 overflow-auto">
      <div className="max-w-2xl w-full bg-space-800/95 border-2 border-hud-amber/35 rounded-xl p-5 font-sans shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <div>
            <p className="text-xl sm:text-2xl tracking-widest text-white/90">ACHIEVEMENTS</p>
            <p className="text-xs text-white/45 tracking-[0.18em] mt-1">
              UNLOCKED {unlockedCount} / {ACHIEVEMENT_COUNT}
            </p>
          </div>
          <button
            type="button"
            data-menu-item
            data-menu-back
            onClick={onBack}
            className="text-xs text-hud-amber/80 hover:text-hud-amber px-3 py-1.5 border border-hud-amber/30 rounded focus:outline-none focus:ring-2 focus:ring-hud-amber"
          >
            CLOSE
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {CATEGORY_ORDER.map((category) => {
            const grouped = categoryItems(items, category)
            if (grouped.length === 0) return null
            return (
              <section key={category} className="flex flex-col gap-2">
                <p className="text-[10px] tracking-[0.28em] text-hud-amber/70">{category.toUpperCase()}</p>
                <div className="flex flex-col gap-2">
                  {grouped.map(({ achievement, unlocked, progress }) => {
                    const title = unlocked || !achievement.hidden ? achievement.title : 'CLASSIFIED'
                    const description =
                      unlocked || !achievement.hidden
                        ? achievement.description
                        : 'Clearer records will be released after the first incident.'
                    return (
                      <div
                        key={achievement.id}
                        className={`grid grid-cols-[40px_1fr] gap-3 rounded-lg border px-3 py-3 ${
                          unlocked
                            ? 'border-hud-amber/35 bg-hud-amber/6'
                            : 'border-white/10 bg-white/[0.03]'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded flex items-center justify-center font-mono text-xs border ${
                            unlocked
                              ? 'border-hud-amber/45 text-hud-amber bg-hud-amber/12'
                              : 'border-white/10 text-white/25 bg-white/5'
                          }`}
                        >
                          {achievement.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className={unlocked ? 'text-white/92 text-sm font-bold' : 'text-white/55 text-sm'}>
                              {title}
                            </p>
                            <p className={unlocked ? 'text-hud-green text-[10px] tracking-[0.2em]' : 'text-white/20 text-[10px] tracking-[0.2em]'}>
                              {unlocked ? 'UNLOCKED' : 'LOCKED'}
                            </p>
                          </div>
                          <p className={unlocked ? 'text-white/62 text-xs mt-1' : 'text-white/35 text-xs mt-1'}>
                            {description}
                          </p>
                          {!unlocked && progress && (
                            <p className="text-hud-blue/75 text-[11px] mt-1 tracking-[0.12em]">
                              {progress.current} / {progress.goal}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
