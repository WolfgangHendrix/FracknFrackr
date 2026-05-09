# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

> **Critical convention.** Every followup must carry a `Priority:` tag. Three buckets:
> - `blocks-release`: cannot ship v1 without this.
> - `nice-to-have`: improves the product but does not block.
> - `polish`: post-release cleanup.

## How to add a followup

```
## F-NNN: Short title

- Priority: blocks-release | nice-to-have | polish
- Context: one or two sentences on why this came up.
- Blocker (if any): the condition that prevents working on this now.
- Unblock condition: what has to be true to start.
- PR / Dot reference (when picked up): #N or dots-N
```

Keep `F-NNN` IDs monotonically increasing. When a followup ships, leave the entry in place and append a `- Resolved: PR #N` line. Never delete.

## Blocks Release

(none yet)

## Nice To Have

### F-001: Split GDD into a Docs/gdd/ tree

- Priority: nice-to-have
- Context: the spiral methodology recommends one file per requirement under `Docs/gdd/`. FrackingAsteroids currently has a single `Docs/GDD.md`. Coverage row `gddRef` anchors point at sections within that file. If the GDD grows or per-section build logs become noisy, split.
- Blocker: none.
- Unblock condition: GDD additions feel cramped, or build-log entries on multiple unrelated features collide in one file.

## Polish

(none yet)
