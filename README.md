# 🌿 Glide

Play as an adorable **Japanese dwarf flying squirrel** in an endless, sun-dappled
forest. Run, scramble up trees, leap from the branches and **glide** on the wind,
then splash down and swim across hidden ponds. No menus, no words — just movement.

It is built to *feel* good: fast, smooth and forgiving. Run at a tree and you
scale it instead of bonking into it. Glide into a trunk and you grab on rather
than crash. Complex inputs are read loosely so you keep your momentum.

## Controls

No UI, no text. Two things to learn and the rest is play.

| | Desktop | Mobile |
|---|---|---|
| **Move** | `W A S D` / arrow keys | left thumb anywhere = a stick |
| **Look** | move the mouse | right thumb anywhere = a stick |
| **Jump / leap / dive** | `Space` | double‑tap on the right |
| **Sprint** | `Shift` | push the move stick fully |
| **Zoom** | mouse wheel | — |

- **On the ground** you run; press toward a tree to scale it.
- **On a tree** push up to climb, steer onto branches, jump to leap off.
  Crest the top and you launch straight into a glide.
- **In the air** the patagium spreads on its own — steer with the move stick
  (left/right to turn, forward to dive for speed, back to flare). Let go and
  you drift gently down. Dive then pull up to trade speed for height.
- **In water** you swim; hold jump to dive under.

## Run it

```bash
npm install
npm run dev        # open the printed localhost URL
```

Build a static, self‑contained bundle (host it anywhere — GitHub Pages, itch.io,
any static server):

```bash
npm run build      # → dist/
npm run preview
```

## How it works

Everything is generated procedurally from a seed — no art assets to download.

```
src/
  config.js            all the tuning: palette, gamefeel, camera
  core/
    Engine.js          renderer + filmic post (bloom, tone map, split-tone grade)
    Input.js           keyboard / mouse + free-placed dual touch sticks
  world/
    Noise.js           seeded simplex + fbm
    Terrain.js         shared height field (mesh AND player sample the same one)
    Forest.js          per-chunk tree placement + climbable skeletons
    TreeFactory.js     procedural tree species, wind-swayed in the vertex shader
    Scatter.js         instanced grass + scattered mushrooms / flowers / rocks
    Water.js           stylized fresnel water that follows the camera
    Sky.js             golden-hour sky, sun + shadow light, ambient
    Particles.js       drifting pollen motes
    World.js           streams chunks around the player, a few per frame
  player/
    Squirrel.js        the model + procedural run / climb / swim / glide animation
    Controller.js      the movement state machine (the gamefeel)
    FollowCamera.js    smooth third-person camera that drifts behind your motion
  main.js              wires it together and runs the loop
```

The world is endless: terrain, trees and plants stream in as 64 m chunks around
you and unload behind you, a couple per frame so crossing a boundary never
stutters. Quality adapts to the device and to the live framerate.

## Verifying visuals

`tools/screenshot.mjs` renders the game headlessly (software WebGL) and can pose
the player for a shot:

```bash
node tools/screenshot.mjs out.png 3000 1280 720 glide   # vista | run | swim | climb | face | test
```
