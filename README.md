# School Wars

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
- The Nurse's Office in the middle of the main hall heals you and protects you from damage, but you can't throw from inside it. Stay longer than 30 seconds, or go in 3 times within 20 seconds (ducking in and out to heal), and you pass out, then respawn with half health.
- First team to 50 kills wins, or whoever leads when the 8-minute timer runs out.

**The Principal (7v1).** The host can switch the lobby to this mode. Seven students (who can share classes) take on one Principal: a bigger, slower boss with 10000 health, 25% damage resistance, 12% extra speed and 20% extra damage, who doesn't respawn and gets nothing from the Nurse's Office. Each student has 3 lives; after the third knockout they spectate. Students win by knocking the Principal out; the Principal wins by surviving the 6-minute timer or knocking every student out of lives. Click **Be the Principal** in the lobby to take the seat, or a bot plays it. The Principal's abilities (keys can be changed in Settings; phones get buttons):

- 🔒 **Detention** (E, 20s cooldown): pick a student in sight, then stop the skill-check needle. The closer to the center, the longer they're locked in the Detention room: 20–30 seconds. Locked-up students can't move or throw, and can't be hurt.
- 📣 **Stern Lecture** (F, 10s): 20 damage and a 1.5-second stun to every student nearby in sight.
- 📝 **Pop Quiz** (C, 6s): a ring of 16 quiz papers in every direction.
- 📢 **Intercom** (X, 20s): see every student through walls for 6 seconds; students get a warning.

**Fog of War (4v4).** Same rules as Team Battle, but you can only see a small circle around you: no long view cone and no seeing a whole room. Walls still block sight.

**3D first person (any mode).** Under **View** in the lobby, the host can switch any mode (Team Battle, Fog of War, the Principal 7v1 and the Duel) to 3D. Everyone is a 3D figure in their class outfit, walking, holding their throw, and you see your own arm and ball. Click the game to grab the mouse, then move the mouse to look in any direction (all the way around, and up and down); W/A/S/D walk and strafe relative to where you're facing, and left click throws. Esc gives the mouse back and opens the menu. The minimap shows which way you're facing. In Fog of War the school goes dark just past the circle you can see; the Principal's Intercom shows students through walls with a red outline, and Detention picks the student closest to your crosshair. On phones, the aim stick turns you side to side and tilts your view up and down.

**Principal Duel (1v1).** Two Principals fight with their own set of powers (same keys as the 7v1 abilities). Each has 1500 health and respawns; first to 3 knockouts wins, or whoever leads after 5 minutes. A duel room holds two players.

- 📋 **Hall Pass** (E, 7s): teleport-dash 350 units where you aim.
- ⏸️ **Suspension Slip** (F, 11s): a fast slip that stuns for 2 seconds.
- 🛡️ **Staff Meeting** (C, 16s): nothing can hurt you for 2.5 seconds.
- 📉 **Report Card** (X, 9s): a huge, slow shot for 90 damage.

Controls: WASD to move, mouse to aim, left click to shoot, R to reload, 1/2/Q/mouse wheel to switch weapons, Space for your super, Tab for the scoreboard, B to change class (it applies on respawn), Esc for the menu. To change the keys, click the gear icon on the home screen or in the Esc menu.

**Supers.** Every class has a super that charges as you deal damage (and slowly on its own). When the meter above your weapon panel says READY, press Space (⭐ on phones): Teacher heals nearby teammates (Extra Credit), Lunch Lady throws a fan of meatballs (Mystery Meat), Jock charges through enemies (Touchdown Dash), Art Kid splashes and slows everyone nearby (Paint Bomb), Nerd fires and moves faster for 6 seconds (Overclock), and the Class Clown throws five cream pies (Pie Barrage).

**Class XP and levels.** Playing a class earns XP for that class: damage dealt, knockouts, finishing a match and winning it. Levels go from 1 to 10, and each level adds 3% damage and 3% max health to that class. XP is saved in your browser, the class picker shows your level and progress, and the results screen shows what you earned.

Line of sight: inside a room you can see the whole room, and in the hallways you can see all the hallways. Looking out of where you are (through a doorway, say), you see a short way all around you and far in a cone where you aim. Walls, lockers and shelves block your view, so you only see through a doorway what you'd see from where you stand. Enemies you can't see aren't drawn; teammates always are. Desks, tables, bleachers and easels are low enough to see over.

Phones and tablets: touch the left half of the screen to move and the right half to aim. Push the right stick further to throw. On-screen buttons handle reload (↻), switch weapon (⇄), the scoreboard (🏆), the menu (☰) and fullscreen (⛶). Play with the phone sideways. To turn the touch controls on (for a touchscreen laptop) or off, use Mobile controls in Settings (the gear icon).

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
