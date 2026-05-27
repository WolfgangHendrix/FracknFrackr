export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-arbiter',
    title: 'Rules are for Sunkers',
    description: 'Defeat your first Arbiter Mark I.',
    icon: '\u2694',
  },
  {
    id: 'max-blaster',
    title: 'Maximum Overdrive',
    description: 'Upgrade your blaster to Mark V.',
    icon: '\u26a1',
  },
  {
    id: 'rich-miner',
    title: 'Corporate Favorite',
    description: 'Mine a total of 5000 scrap.',
    icon: '\ud83d\udcb0',
  },
  {
    id: 'survivor',
    title: 'Hard to Kill',
    description: 'Trigger a Smart Bomb and survive the run for another 2 minutes.',
    icon: '\ud83d\udca3',
  },
  {
    id: 'endless-voyage',
    title: 'Beyond the Rim',
    description: 'Reach a Ledger level of 50 in endless mode.',
    icon: '\ud83d\ude80',
  },
]
