'use client'

interface ShopFabProps {
  highlight?: boolean
  onClick: () => void
}

export function ShopFab({ highlight, onClick }: ShopFabProps) {
  return (
    <button
      onClick={onClick}
      data-menu-item
      className={`!fixed bottom-14 left-1/2 -translate-x-1/2 z-40 w-16 h-16 rounded-full font-bold text-2xl shadow-lg transition-all flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-white/80 focus:scale-110 ${
        highlight
          ? 'bg-hud-green text-space-900 animate-pulse scale-110'
          : 'bg-hud-green/80 text-space-900 hover:scale-110 active:scale-95 hover:bg-hud-green'
      }`}
      aria-label="Open trade station"
      data-testid="shop-fab"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-8 h-8"
      >
        <path d="M2.25 2.25a.75.75 0 0 0 0 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 0 0-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 0 0 0-1.5H5.378A2.25 2.25 0 0 1 7.5 14.25h11.218a.75.75 0 0 0 .674-.421l2.916-5.832A.75.75 0 0 0 21.638 7H7.072l-.81-3.035A1.75 1.75 0 0 0 4.573 2.5L2.82 2.25h-.57ZM7.5 18a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm10.5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
      </svg>
    </button>
  )
}
