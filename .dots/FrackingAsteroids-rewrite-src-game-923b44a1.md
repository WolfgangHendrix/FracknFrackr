---
title: Rewrite src/game/virtual-joystick.ts to consume @randroids-dojo/vibekit
status: open
priority: 2
issue-type: task
created-at: "2026-05-08T23:28:24.988066-05:00"
---

FrackingAsteroids's virtual-joystick.ts is the older DOM-attached style (creates HTMLElements, directly mutates an InputState). VibeKit's version is headless: it manages JoystickState only and the consumer wires the DOM. Refactor: keep an FrackingAsteroids-specific src/game/virtual-joystick-dom.ts (or similar) that handles the overlay + pointer event wiring and dispatches into VibeKit's createJoystick / beginJoystick / moveJoystick / endJoystick. Then read the deflection vector each frame and set the corresponding InputState fields. Adds ../VibeKit as a file: dep.
