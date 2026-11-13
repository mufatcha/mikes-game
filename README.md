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
- Pick a team and a class in the lobby: Teacher, Lunch Lady, Jock, Art Kid, Nerd, Class Clown, Band Kid, Orchestra Kid, Gamer or Quiet Kid. Each has its own stats and throwables. The Band Kid also picks a section (Low Brass: Tuba Blast and Trombone Slide; Percussion: Drumsticks and Cymbal Crash; Brass: Trumpet Blast and Fanfare; Woodwind: Reed Darts and Piccolo Trill), and so does the Orchestra Kid, who plays strings only (Violin: Violin Bow and Pizzicato; Viola: Viola Bow and Tremolo; Cello: Cello Bow and Spiccato; Double Bass: Double Bass Thump and Slap Bass). Band and Orchestra Kids are seen holding the instrument they play, in both views and in your own hands in 3D. The host starts the match, and bots fill the open slots up to 4v4. Below the school on the left is the music wing: the **Band Room** (down a door at the bottom of the left cross hall), where Band Kids spawn among the music stands, risers and drum set, and the **Orchestra Room** (down a door at the bottom of the Cafeteria), where Orchestra Kids spawn in a half circle around the conductor's podium. The TARDIS can fly to both.
- Friends can join mid-match and take over a bot. If someone leaves, a bot takes their place.
- The map is one big school with street-style hallways (asphalt with road markings) lined with lockers. Every room is shared by both teams, and each class spawns in its own room: Teacher in the Classroom, Lunch Lady in the Cafeteria, Jock in the Gym, Art Kid in the Art Room, Nerd in the Library, Class Clown in Detention, Band Kid in the Gym, Orchestra Kid in the Cafeteria, Quiet Kid in the back of the Library, Gamer in the Game Room (down through a door at the bottom of the right cross hall: arcade cabinets, a big TV with a couch and beanbags, gaming PCs, RGB lights and a neon floor).
- Each team can have only one of each class (e.g. one Lunch Lady per team), except the Orchestra Kid: two per team. Taken classes are greyed out in the picker.
- The Nurse's Office in the middle of the main hall heals you and protects you from damage, but you can't throw from inside it. Stay longer than 30 seconds, or go in 3 times within 20 seconds (ducking in and out to heal), and you pass out, then respawn with half health.
- First team to 50 kills wins, or whoever leads when the 8-minute timer runs out.

**The Principal (7v1).** The host can switch the lobby to this mode. Seven students (who can share classes) take on one Principal: a bigger, slower boss with 10000 health, 25% damage resistance, 12% extra speed and 20% extra damage, who doesn't respawn and gets nothing from the Nurse's Office. Each student has 3 lives; after the third knockout they spectate. Students win by knocking the Principal out; the Principal wins by surviving the 6-minute timer or knocking every student out of lives. Click **Be the Principal** in the lobby to take the seat, or a bot plays it. The Principal's abilities (keys can be changed in Settings; phones get buttons):

- 🔒 **Detention** (E, 20s cooldown): pick a student in sight, then stop the skill-check needle. The closer to the center, the longer they're locked in the Detention room: 20–30 seconds. Locked-up students can't move or throw, and can't be hurt.
- 📣 **Stern Lecture** (F, 10s): 20 damage and a 1.5-second stun to every student nearby in sight.
- 📝 **Pop Quiz** (C, 6s): a ring of 16 quiz papers in every direction.
- 📢 **Intercom** (X, 20s): see every student through walls for 6 seconds; students get a warning.

**Fog of War (4v4).** Same rules as Team Battle, but you can only see a small circle around you: no long view cone and no seeing a whole room. Walls still block sight.

**3D first person (any mode).** Under **View** in the lobby, the host can switch any mode (Team Battle, Fog of War, the Principal 7v1 and the Duel) to 3D. Everyone is a 3D figure in their class outfit, walking, holding their throw, and you see your own arm and ball. Click the game to grab the mouse, then move the mouse to look in any direction (all the way around, and up and down); W/A/S/D walk and strafe relative to where you're facing, and left click throws. Esc gives the mouse back and opens the menu. The minimap shows which way you're facing. In Fog of War the school goes dark just past the circle you can see; the Principal's Intercom shows students through walls with a red outline, and Detention picks the student closest to your crosshair. On phones, the aim stick turns you side to side and tilts your view up and down.

**VR headsets (3D matches).** On a Meta Quest (open the site in its browser) or a PC headset (Chrome or Edge with SteamVR or the Oculus app running), open the menu in a 3D match and choose **🥽 Play in VR**. VR draws the school in real 3D on the graphics chip, at the headset's full sharpness: walls, furniture, floor and ceiling look solid from every angle (straight up and down too), and everyone is a 3D figure with a name tag and health bar. Turn your head to look around (you can lean, too). You aim with your right hand: a ring shows where it's pointing (out on whatever it hits) with a short laser from your controller, and you throw there; walking follows where you look. Without a right controller you aim where you look. Your arms carry screens that turn to face you (raise an arm to check it): by default the left one has your health, ammo, score, minimap, powers, kill feed and messages, and the right one always shows the scoreboard. In Settings, **🥽 VR** lets you put each of those on the left arm, the right arm, in front of you, or hide it. The crosshair stays in the middle of your view. Anything set for an arm without a controller (hand tracking) floats in front of you instead. Left stick walks (relative to where you're looking), right stick left/right turns in steps, right trigger throws, A jumps, B crouches, left trigger (or clicking the left stick) sprints, X reloads, Y switches weapon, right grip is your super, and left grip shows the scoreboard in front of you if you've set it to In front. The Principal's four powers are the right grip, right stick up, right stick down and clicking the right stick; Detention counts as a good stop in VR. Getting hit buzzes the controllers. Press ☰ on the left controller (or click both sticks together, on headsets that keep ☰ for themselves) to open **Settings** in VR: point the laser at a row and pull the right trigger to change VR resolution, where each HUD piece goes, reset the layout, or leave VR; B or ☰ closes it. Pressing the headset's home button also leaves VR, and VR closes by itself when the match ends. Your in-game arms follow your real ones: a hand around each controller and a forearm in your class's sleeve, with the ball in your right (throwing) hand. Settings → **🥽 VR** has **VR resolution**, the headset's rendering resolution: Auto (its own, lowered only if it keeps missing frames), Low, Medium, High (its own) or Ultra (extra sharp, for fast headsets and PCs). VR only works in the website, not the Steam desktop app.

In 3D, desks, tables and other low furniture hide the part of anyone standing behind them.

**3D throw physics.** In 3D, everything you throw flies in 3D: it goes where you look (aim up to lob, down to bounce it off the floor), gravity pulls it into an arc, and its shadow on the floor shows where it'll come down. Balls bounce off the floor, the ceiling and desk tops and roll to a stop; splats and darts end where they land. Throws sail over desks, tables and bleachers if they're high enough (but not lockers, shelves or walls), and a throw that passes over someone's head misses. Bots lob far enough to reach you.

**Mascot Duel (1v1).** The two school mascots fight it out: Lenny the Lemon (Lemons) against Peely the Orange (Orange Peels). Each has 1500 health, their own two weapons and four powers of their own (same keys as the 7v1 abilities), and respawns; first to 3 knockouts wins, or whoever leads after 5 minutes. A duel room holds two players.

🍋 **Lenny the Lemon** throws Lemon Seeds (fast) and Whole Lemons (bouncy, heavy):

- 🍋 **Lemon Drops** (E, 6s): a fan of 5 bouncy lemon drops that ricochet off walls.
- 🌀 **Roll Out** (F, 8s): roll where you aim, flattening anyone in the way for 45 damage and a 1-second stun.
- 🥤 **Lemonade Spill** (C, 14s): splash sticky lemonade where you aim; enemies in it are slowed and take 40 damage a second for 5 seconds.
- 💛 **Vitamin C** (X, 18s): heal 300 health and move 30% faster for 4 seconds.

🍊 **Peely the Orange** throws Orange Seeds (rapid) and Orange Wedges (hard-hitting):

- 💦 **Juice Squirt** (E, 5s): spray 7 drops of sticky juice in a cone; every hit slows them for 2 seconds.
- 🟠 **Peel Trap** (F, 8s): drop a slippery peel; the first enemy to step on it takes 30 damage and is stunned 1.5 seconds. Up to 3 at once.
- 🛡️ **Thick Rind** (C, 16s): nothing can hurt you for 2.5 seconds.
- 🍊 **Big Orange** (X, 9s): lob a huge orange (60 damage) that bursts into 8 segments when it hits something or lands.

Controls: WASD to move, mouse to aim, left click to shoot, R to reload, 1/2/Q/mouse wheel to switch weapons, Space for your super, Tab for the scoreboard, B to change class (it applies on respawn), Esc for the menu. To change the keys, click the gear icon on the home screen or in the Esc menu.

**Game controllers.** Plug in (or pair) an Xbox, PlayStation or other controller and press any button. Left stick moves, right stick aims (or looks around in 3D), RT throws, A jumps, B crouches, LT or clicking the left stick sprints, X reloads, Y switches weapon, RB is your super, the D-pad is the Principal's or mascot's four powers, Start opens and closes the menu, and Back holds the scoreboard. It rumbles when you get hit. Moving the mouse switches aiming back to the mouse.

The controller works in every menu too: the D-pad or left stick moves the yellow highlight, A presses, B goes back or closes the menu, and left/right changes a slider. Settings has a 🎮 Controller section: look sensitivity, aim reach, stick dead zone, aim assist (Off/Low/High), invert look, swap sticks, vibration, and remapping any button (Start and the D-pad stay fixed).

**Jump, sprint and crouch.** Space jumps, hold Left Shift to sprint (35% faster) and hold C to crouch (slower and shorter); all three can be changed in Settings, and phones get ⤒, 🏃 and 🧎 buttons. You can jump over or up onto desks, tables and bleachers and walk along the top. In 3D your view rises and falls with you, throws leave your hand at your height, and a throw at chest height flies over someone crouching. Super is now on V and the third Principal/mascot power on Z (binds you saved before keep working).

**Supers.** Every class has a super that charges as you deal damage (and slowly on its own). When the meter above your weapon panel says READY, press V (⭐ on phones): Teacher heals nearby teammates (Extra Credit), Lunch Lady throws a fan of meatballs (Mystery Meat), Jock charges through enemies (Touchdown Dash), Art Kid splashes and slows everyone nearby (Paint Bomb), Nerd fires and moves faster for 6 seconds (Overclock), the Class Clown throws five cream pies (Pie Barrage), the Band Kid heals nearby teammates 25 and speeds them up 30% for 6 seconds (Fight Song), and the Orchestra Kid throws a wide fan of 9 music notes (Crescendo), the Gamer rolls a character, heals 40 and plays as them for a while (Character Select: Cuphead or Mugman 30% each for 15 seconds, with rapid finger-gun shots or a spread shot that never run out; the Pyro 25% for 15 seconds, arriving with an Airblast that knocks enemies back and turns their throws around, then a Flamethrower that never runs dry and sets people on fire, with afterburn until they reach the Nurse's Office; or Captain Churchill 15% for 12 seconds, driving his tank: big shells and much less damage taken, but slower), and the Quiet Kid goes unnoticed for 6 seconds: enemies can't see them unless they bump right into them, and bots ignore them (Unnoticed). The Quiet Kid throws silent Paper Planes and Sticky Notes that slow whoever they hit.

**Class XP and levels.** Playing a class earns XP for that class: damage dealt, knockouts, finishing a match and winning it. Levels go from 1 to 10, and each level adds 3% damage and 3% max health to that class. XP is saved in your browser, the class picker shows your level and progress, and the results screen shows what you earned.

Line of sight: inside a room you can see the whole room, and in the hallways you can see all the hallways. Looking out of where you are (through a doorway, say), you see a short way all around you and far in a cone where you aim. Walls, lockers and shelves block your view, so you only see through a doorway what you'd see from where you stand. Enemies you can't see aren't drawn; teammates always are. Desks, tables, bleachers and easels are low enough to see over.

Phones and tablets: touch the left half of the screen to move and the right half to aim. Push the right stick further to throw. On-screen buttons handle reload (↻), switch weapon (⇄), the scoreboard (🏆), the menu (☰) and fullscreen (⛶). Play with the phone sideways. To turn the touch controls on (for a touchscreen laptop) or off, use Mobile controls in Settings (the gear icon).

**Install it as an app.** School Wars is still a website, and it can also be installed like an app with its own icon that opens full screen. Click **📲 Install app** at the top left of the title screen (Chrome, Edge, Android, Samsung Internet), or use the install icon in the address bar. On iPhone or iPad in Safari, the button explains how: Share, then **Add to Home Screen**. The app updates itself whenever the site does, and it still needs the internet to play. (`app/manifest.ts` describes the app, `public/sw.js` keeps its files on the device, and the icons are in `public/icons/`.)


## Steam (desktop app)

The `desktop/` folder turns School Wars into a desktop game that Steam can sell or give away. It's an Electron app: a window that opens the live site (`https://mikes-game.vercel.app`) full screen, so it always has the newest version and Steam players play with website players. Controllers, mouse look and sound all work in it, F11 or Alt+Enter switches between full screen and a window, the Steam overlay (Shift+Tab) works, and the title screen gets a **✕ Quit game** button. If there's no internet it shows a "Try again" screen.

**Build it (Windows).**
```bash
cd desktop
bun install
bun run start   # try it in a window
bun run build   # makes desktop/dist/win-unpacked/SchoolWars.exe
```
Mac and Linux builds (`bun run build:mac`, `bun run build:linux`) have to be made on a Mac or Linux computer.

**Put it on Steam.** These steps need a grown-up: Steam asks for legal name, bank and tax details.
1. Sign up at [partner.steamgames.com](https://partner.steamgames.com) (Steamworks) and pay the Steam Direct fee for the game (US $100, paid back after the game earns $1,000).
2. Steam gives the game an **App ID** and a **Depot ID**. Put them in `desktop/steam/app_build.vdf` in place of `YOUR_APP_ID` and `YOUR_DEPOT_ID`.
3. In Steamworks, under **Installation → General**, add a launch option: executable `SchoolWars.exe`, OS Windows.
4. Download the Steamworks SDK, then upload the build with its `steamcmd`: `steamcmd +login <your steam login> +run_app_build <full path to>\desktop\steam\app_build.vdf +quit`
5. In Steamworks under **SteamPipe → Builds**, set the new build live on the `default` branch.
6. Fill in the store page (description, screenshots, capsule art, a trailer), send the store page and build for Valve's review, and wait for **Coming Soon** (at least 2 weeks) before release.

Each time you change the game, pushing to GitHub updates the Steam version too, because it loads the live site. You only upload a new Steam build when something in `desktop/` changes.

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
