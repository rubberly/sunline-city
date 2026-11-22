# Sunline City

An open-world 3D browser game built with three.js: a big island with a city, a second town, forests, swamps, an airport, boats with wave physics, walk-in buildings, crowds of pedestrians, police chases and online versus play.

## Play online with friends

Everyone who opens the hosted page at the same time is in the same world. You see each other's characters and cars, and you can punch, run over or ram each other. Knockouts count as kills on the scoreboard. Plug a controller into your own computer to play with a gamepad.

## Run it locally

```
npm install
npm start
```

Then open http://localhost:3000 (open it in two windows to try versus mode).

## Deploy to Render

The repo includes `render.yaml`. In Render, choose **New > Blueprint**, pick this repository and deploy. The server serves the game at `/` and runs the multiplayer relay at `/ws`.

## Files

- `index.html` — the whole game (HTML, CSS and JavaScript in one file)
- `server.js` — serves the game and relays player state over WebSockets
- `render.yaml` — Render deploy settings

## Controls

WASD move · mouse look · Shift sprint · Space jump/handbrake · F enter/exit vehicles · R or click to punch · E interact/horn · H headlights · V camera · M map · Esc pause. Xbox-style controllers work with the GTA V layout.
