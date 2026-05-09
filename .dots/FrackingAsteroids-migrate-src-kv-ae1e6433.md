---
title: Migrate src/kv.ts to @randroids-dojo/vibekit/server (kv + sign + rate-limit)
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:28:35.473172-05:00"
---

FrackingAsteroids src/kv.ts likely matches the same pattern. Replace with getKv / readKv / writeKv from @randroids-dojo/vibekit/server. If FrackingAsteroids signs anything (replay tokens, admin tokens), migrate to signToken/verifyToken too.
