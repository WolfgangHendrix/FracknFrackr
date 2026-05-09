---
title: Migrate src/persistence.ts to @randroids-dojo/vibekit/storage
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:28:35.470150-05:00"
---

FrackingAsteroids has src/persistence.ts. Audit the API; if it is the same defensive read/write/listen pattern the other projects use, replace internals with @randroids-dojo/vibekit/storage calls (readStorage/writeStorage/listenStorage with a zod schema per persisted shape). Keep persistence.ts as a feature-named facade so call sites do not change.
