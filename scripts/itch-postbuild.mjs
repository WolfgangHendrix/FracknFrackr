// Post-build fix for itch.io HTML hosting.
//
// itch.io's file server returns 403 Forbidden for any path beginning with an
// underscore, which is exactly where Next.js puts its static assets (`_next/`).
// The result is that index.html loads but every script/style under `_next/`
// is blocked, leaving a blank game.
//
// This rewrites every asset reference `_next/` -> `next/` across the exported
// text files and renames the `out/_next` directory to `out/next`. We only
// touch the `_next/` form (with the trailing slash): bare `_next` also shows
// up as minified JS identifiers, but those can never contain a `/`, so the
// slash makes the match unambiguous and safe.

import { readdirSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'out')
const REWRITE_EXTS = new Set(['.html', '.js', '.css', '.txt', '.json'])

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full)
    } else {
      const dot = entry.lastIndexOf('.')
      const ext = dot === -1 ? '' : entry.slice(dot)
      if (!REWRITE_EXTS.has(ext)) continue
      const text = readFileSync(full, 'utf8')
      if (!text.includes('_next/')) continue
      writeFileSync(full, text.split('_next/').join('next/'))
    }
  }
}

walk(OUT)
renameSync(join(OUT, '_next'), join(OUT, 'next'))
console.log('itch-postbuild: rewrote _next/ -> next/ and renamed out/_next -> out/next')
