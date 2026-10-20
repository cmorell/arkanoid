# Arkanoid

A browser Arkanoid / Breakout clone in plain HTML, CSS and JavaScript — no
dependencies, no build step. Just open `index.html`.

**Play it:** https://cmorell.github.io/arkanoid/

## Controls

| Action | Input |
| --- | --- |
| Move paddle | Mouse, touch, or `←` / `→` |
| Launch ball | Click or `Space` |
| Pause | `P` |

## Features

- 5 hand-made levels with 1-, 2- and 3-hit bricks plus indestructible blocks
- 6 power-ups: widen, shrink, multiball, slow ball, extra life, sticky paddle
- Angle-based paddle deflection — hit the edges to steer the ball
- Sub-stepped collision so fast balls never tunnel through bricks
- Particles, screen shake, and WebAudio sound effects (toggleable)
- High score persisted in `localStorage`
- Responsive canvas, works on phones

## Files

- `index.html` — markup and HUD
- `style.css` — layout and theming
- `game.js` — the whole engine (state, physics, rendering, input)

## Running locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
