# Mike's Game

A private, browser-based top-down shooter: 4v4 team deathmatch, invite codes only (no public lobby), and bots that fill any empty slots.

## Running locally

```bash
bun install
bun run dev
```

This starts two processes:

- **Web app** (Next.js), at http://localhost:3000, or the next free port. It serves the menus, lobby, and game client.
- **Game server** (Bun + WebSockets), on port 4001. It runs the authoritative simulation, the rooms, and the bot AI.

To test with friends on the same network, open the web app at your machine's LAN IP (e.g. `http://192.168.1.117:3000`). The client connects to the game server on the same host at port 4001.

## How it plays

- **Create private match** gives you a 6-character invite code and link. Only people with the code can join.
- Pick a team and a class in the lobby: Teacher, Lunch Lady, Jock, Art Kid, Nerd, or Class Clown. Each has its own stats and throwables. The host starts the match, and bots fill the open slots up to 4v4.
- Friends can join mid-match and take over a bot. If someone leaves, a bot takes their place.
- The map is one big school with street-style hallways (asphalt with road markings) lined with lockers. Every room is shared by both teams, and each class spawns in its own room: Teacher in the Classroom, Lunch Lady in the Cafeteria, Jock in the Gym, Art Kid in the Art Room, Nerd in the Library, Class Clown in Detention.
- Each team can have only one of each class (e.g. one Lunch Lady per team). Taken classes are greyed out in the picker.
- The Nurse's Office in the middle of the main hall heals you and protects you from damage, but you can't throw from inside it. Stay longer than 30 seconds and you pass out, then respawn with half health.
- First team to 50 kills wins, or whoever leads when the 8-minute timer runs out.

Controls: WASD to move, mouse to aim, left click to shoot, R to reload, 1/2/Q/mouse wheel to switch weapons, Tab for the scoreboard, B to change class (it applies on respawn), Esc for the menu.

## Project layout

| Path | What's there |
| --- | --- |
| `shared/` | Code used by both client and server: constants, weapons/armor/loadouts, map, collision physics, network protocol |
| `server/` | Game server: room and invite-code management (`index.ts`, `room.ts`), match simulation (`match.ts`), bot AI (`bot.ts`), A* pathfinding (`nav.ts`) |
| `game/` | Browser game client: networking with client-side prediction and interpolation (`connection.ts`), canvas renderer and HUD (`renderer.ts`), input, sound |
| `components/`, `app/` | Next.js pages and React UI: home, lobby, class picker, in-game menus, results |

Class and throwable stats live in `shared/archetypes.ts`, and the map layout lives in `shared/map.ts`.

## Deploying (free)

The website and the game server are hosted separately. The game server needs a host that keeps WebSocket connections open, which serverless platforms like Vercel can't do.

**1. Game server on Render (free).**
- Sign in at [render.com](https://render.com) with GitHub, then choose **New → Blueprint** and pick this repo.
- Render reads `render.yaml` and builds the `Dockerfile`.
- When it's done you get a URL like `https://mikes-game-server.onrender.com`. Check that `/health` on it returns `{"ok":true,...}`.

**2. Website on Vercel (free).**
- Sign in at [vercel.com](https://vercel.com) with GitHub, then choose **Add New → Project** and import this repo.
- Add the environment variable `NEXT_PUBLIC_GAME_SERVER_URL` = your Render URL, then deploy.
- You get a URL like `https://mikes-game.vercel.app`. That's the link to share.

**3. Lock the game server to your site.**
- In Render, set `ALLOWED_ORIGINS` to your Vercel URL and redeploy. Only your site can then create and join matches.

Every `git push` redeploys both services.

On Render's free plan, the game server sleeps after 15 minutes with nobody connected, and the next visitor waits about a minute while it wakes up. The site shows a "Waking up the game server…" message during that time. Matches in progress keep it awake.
