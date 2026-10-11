import { TICK_MS } from "../shared/constants";
import { Room, type SocketData } from "./room";

const PORT = Number(process.env.PORT ?? 4001);
/** Comma-separated list of allowed web origins, or "*" in development. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim());
const MAX_ROOMS = 200;
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;
// No 0/O or 1/I/L, so codes are easy to read out loud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

const rooms = new Map<string, Room>();

function newCode() {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    if (!rooms.has(code)) return code;
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
  return allow
    ? {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Vary: "Origin",
      }
    : {};
}

function json(req: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return ALLOWED_ORIGINS.includes("*") || (origin !== null && ALLOWED_ORIGINS.includes(origin));
}

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
    if (url.pathname === "/health") return json(req, { ok: true, rooms: rooms.size });

    if (url.pathname === "/rooms" && req.method === "POST") {
      if (!originAllowed(req)) return json(req, { error: "Origin not allowed" }, 403);
      if (rooms.size >= MAX_ROOMS) return json(req, { error: "Server is busy, try again later." }, 503);
      const code = newCode();
      rooms.set(code, new Room(code));
      return json(req, { code });
    }

    const roomMatch = url.pathname.match(/^\/rooms\/([A-Z0-9]+)$/);
    if (roomMatch && req.method === "GET") {
      const room = rooms.get(roomMatch[1]);
      if (!room) return json(req, { error: "No match with that code." }, 404);
      return json(req, { code: room.code, players: room.clients.size, full: room.isFull, phase: room.phase });
    }

    if (url.pathname === "/ws") {
      if (!originAllowed(req)) return new Response("Origin not allowed", { status: 403 });
      const code = (url.searchParams.get("code") ?? "").toUpperCase();
      if (!rooms.has(code)) return new Response("No match with that code.", { status: 404 });
      const ok = server.upgrade(req, { data: { code, clientId: crypto.randomUUID() } });
      return ok ? undefined : new Response("Upgrade failed", { status: 400 });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    data: {} as SocketData,
    idleTimeout: 60,
    maxPayloadLength: 16 * 1024,
    open(ws) {
      rooms.get(ws.data.code)?.join(ws);
    },
    message(ws, message) {
      rooms.get(ws.data.code)?.handle(ws.data.clientId, message);
    },
    close(ws) {
      rooms.get(ws.data.code)?.leave(ws.data.clientId);
    },
  },
});

// Fixed-step simulation loop shared by every room.
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc = Math.min(acc + (now - last), TICK_MS * 5);
  last = now;
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    for (const room of rooms.values()) room.tick();
  }
}, 4);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.clients.size === 0 && now - room.emptySince > EMPTY_ROOM_TTL_MS) rooms.delete(code);
  }
}, 30_000);

console.log(`Game server listening on http://localhost:${server.port}`);
