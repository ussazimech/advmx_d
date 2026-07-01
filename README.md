# Signage CMS — Backend

Minimal backend for a digital signage CMS: upload images/short videos, build
ordered playlists, pair physical displays with a 6-digit code, and push
content updates to them in realtime. Includes a basic fullscreen HTML player.

## Stack
Node.js + TypeScript + Express + Prisma + SQLite (demo) / PostgreSQL (prod) + Socket.io

## 1. Install

```bash
cd signage-cms
npm install
cp .env.example .env
```

The default `.env` uses SQLite (`file:./dev.db`) — zero setup, perfect for a demo.

## 2. Create the database

```bash
npx prisma migrate dev --name init
```

This creates `dev.db` and generates the Prisma Client.

## 3. Run the server

```bash
npm run dev
```

Server starts at `http://localhost:4000`.

## 4. Use the dashboard

Open `http://localhost:4000/dashboard.html` in a browser. Create an account
(or sign in), then:

- **Media** — upload images/videos, see them in a grid, delete them.
- **Playlists** — create a playlist, open it, add media, reorder with the
  ↑/↓ buttons, rename or delete the playlist.
- **Displays** — pair a screen by typing in the 6-digit code it shows (open
  `http://localhost:4000/player.html` on another tab/device to get one),
  rename it, assign a playlist from the dropdown, or remove it.

This is plain HTML/CSS/JS calling the same REST API below — no build step,
no separate frontend deploy. If you'd rather test with curl directly, the
flow is the same one described next.

## 5. Try the full flow via curl (optional — the dashboard does all of this)

**a) Create an admin account**
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'
```
Copy the `token` from the response — use it as `Authorization: Bearer <token>` below.

**b) Upload media**
```bash
curl -X POST http://localhost:4000/api/media \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/image.jpg" \
  -F "durationSecs=8"
```

**c) Create a playlist and add the media**
```bash
curl -X POST http://localhost:4000/api/playlists \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"name":"Lobby Loop"}'

curl -X POST http://localhost:4000/api/playlists/<playlistId>/items \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"mediaId":"<mediaId>"}'
```

**d) Open the player**

Open `http://localhost:4000/player.html` in a browser (or on an actual
screen/kiosk browser). It registers itself and shows a 6-digit pairing code.

**e) Claim the display from the dashboard side**
```bash
curl -X POST http://localhost:4000/api/displays/claim \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"pairingCode":"482913","name":"Lobby Screen"}'
```

**f) Assign the playlist to the display**
```bash
curl -X PATCH http://localhost:4000/api/displays/<displayId> \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"playlistId":"<playlistId>"}'
```

The player tab updates within seconds (via the socket push, or the 20s
fallback poll) and starts looping through the playlist fullscreen.

## API summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /api/auth/register | — | create dashboard user |
| POST | /api/auth/login | — | get JWT |
| POST | /api/media | JWT | upload image/video |
| GET | /api/media | JWT | list media library |
| DELETE | /api/media/:id | JWT | delete media |
| POST | /api/playlists | JWT | create playlist |
| GET | /api/playlists | JWT | list playlists |
| POST | /api/playlists/:id/items | JWT | add media to playlist |
| PATCH | /api/playlists/:id/items/reorder | JWT | reorder items |
| DELETE | /api/playlists/:id/items/:itemId | JWT | remove item |
| GET | /api/displays | JWT | list displays |
| POST | /api/displays/claim | JWT | pair a display via code |
| PATCH | /api/displays/:id | JWT | rename / assign playlist |
| DELETE | /api/displays/:id | JWT | unpair / remove |
| POST | /api/displays/register | — (device) | screen self-registers |
| GET | /api/displays/me | device token | poll pairing status |
| GET | /api/displays/me/content | device token | fetch active playlist |

## Deploying (GitHub → Railway/Render)

1. Switch `prisma/schema.prisma` datasource provider to `"postgresql"`.
2. Push this repo to GitHub.
3. On Railway: New Project → Deploy from GitHub repo → add a Postgres plugin
   (injects `DATABASE_URL` automatically). Same idea on Render with a
   managed Postgres instance.
4. Set environment variables: `JWT_SECRET`, `PUBLIC_URL`.
5. Build command: `npm run build` (runs `prisma generate && tsc`)
   Start command: `npm start` (runs `prisma migrate deploy` then boots the server)

Every push to `main` will redeploy and apply any new migrations safely.

## Where to add features next

- **Scheduling**: add a `Schedule` model (displayId, playlistId, daysOfWeek,
  startTime, endTime) and have `/me/content` pick the active schedule instead
  of the static `playlistId`.
- **Multi-zone layouts**: split the player's stage into regions, each driven
  by its own playlist.
- **Cloud storage**: swap `multer.diskStorage` for an S3/R2 client in
  `media.ts` — nothing else needs to change since assets are referenced by URL.
- **Display health dashboard**: use `lastSeenAt` to flag a display `OFFLINE`
  if it hasn't checked in within e.g. 2 minutes (a small cron/cleanup job).
