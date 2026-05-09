---
title: Audit src/game/audio.ts for VibeKit contribution
status: open
priority: 4
issue-type: task
created-at: "2026-05-08T23:28:35.466516-05:00"
---

FrackingAsteroids has its own audio module (and is the predecessor that VibeRacer's audioEngine drew from). Cross-reference with VibeRacer's src/game/audioEngine.ts and audio modules in VibeCity/Flatline. If a common AudioContext + master + buses + first-gesture-resume pattern emerges, contribute the shared shape to ../VibeKit (likely after VibeRacer's decouple-audioEngine task lands first).
