/**
 * Build-time debug flag. Resolved from the NEXT_PUBLIC_DEBUG env var so
 * webpack can inline the constant and dead-code-eliminate every `if
 * (DEBUG_ENABLED) { ... }` branch in production builds (the string literal
 * comparison is statically false when the var is unset).
 *
 * To enable locally:
 *   1. Create `.env.local` at the project root with:
 *        NEXT_PUBLIC_DEBUG=1
 *   2. Restart `npm run dev`.
 *
 * Distribution builds (e.g. `npm run build` without the env var set) ship
 * with the flag false and the entire DebugPanel + helpers tree-shaken out.
 *
 * Why a literal comparison: TypeScript and webpack can both resolve
 * `process.env.NEXT_PUBLIC_DEBUG === '1'` to a boolean at build time only
 * when written as a literal expression. Wrapping it in a function would
 * defeat tree-shaking, so this stays simple.
 */
export const DEBUG_ENABLED: boolean = process.env.NEXT_PUBLIC_DEBUG === '1'
