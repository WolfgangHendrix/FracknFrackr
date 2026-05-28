'use client'

import { useState, useCallback } from 'react'
import { getSfxVolume, setSfxVolume, getMusicVolume, setMusicVolume } from '@/game/volume-control'

export function SoundFab() {
  const [open, setOpen] = useState(false)
  const [sfxVol, setSfxVol] = useState(() => Math.round(getSfxVolume() * 100))
  const [musicVol, setMusicVol] = useState(() => Math.round(getMusicVolume() * 100))

  const handleSfxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setSfxVol(val)
    setSfxVolume(val / 100)
  }, [])

  const handleMusicChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setMusicVol(val)
    setMusicVolume(val / 100)
  }, [])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-14 left-6 z-50 w-14 h-14 rounded-full bg-hud-blue text-space-900 font-bold text-xl shadow-lg hover:scale-110 active:scale-95 transition-transform flex items-center justify-center"
        aria-label="Sound settings"
      >
        <SpeakerIcon />
      </button>
    )
  }

  return (
    <div className="fixed bottom-14 left-6 z-50 w-64 max-w-[calc(100vw-3rem)] bg-space-800 border border-hud-blue/30 rounded-lg shadow-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-hud-blue font-sans text-sm font-bold">Sound</span>
        <button
          onClick={() => setOpen(false)}
          className="-mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white text-2xl leading-none transition-colors"
          aria-label="Close sound settings"
        >
          x
        </button>
      </div>

      <label className="flex flex-col gap-1.5 mb-4">
        <div className="flex justify-between">
          <span className="text-white font-sans text-sm">SFX</span>
          <span className="text-gray-400 font-sans text-sm">{sfxVol}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={sfxVol}
          onChange={handleSfxChange}
          className="w-full h-6 rounded-full appearance-none cursor-pointer accent-hud-blue bg-space-700"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <div className="flex justify-between">
          <span className="text-white font-sans text-sm">Music</span>
          <span className="text-gray-400 font-sans text-sm">{musicVol}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={musicVol}
          onChange={handleMusicChange}
          className="w-full h-6 rounded-full appearance-none cursor-pointer accent-hud-blue bg-space-700"
        />
      </label>
    </div>
  )
}

function SpeakerIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}
