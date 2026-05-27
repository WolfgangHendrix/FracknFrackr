# Frak'n Frak'r

Standalone browser game. Three.js voxel asteroid mining.

## Run locally

```bash
npm install
npm run dev        # iterate at http://localhost:3000
npm run build      # produce static export in ./out
npm run serve      # serve ./out at http://localhost:3000
```

## Ship to itch.io

1. `npm run build`
2. Zip the **contents** of `./out` (not the folder itself — `index.html` must be at the root of the zip).
3. On itch.io: create a new project, set kind = "HTML", upload the zip, check "This file will be played in the browser".
4. Set the embed viewport (e.g. 1280×720) and tick "Mobile friendly" if you want it playable on phones.

Saves live in `localStorage`. No backend.
