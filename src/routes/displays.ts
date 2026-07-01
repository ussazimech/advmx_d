import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authAdmin, AuthedRequest } from "../middleware/authAdmin";
import { authDevice, DeviceRequest } from "../middleware/authDevice";
import { generatePairingCode, generateDeviceToken } from "../lib/tokens";

const router = Router();

/* ---------------------------------------------------------------------- */
/*  DEVICE-FACING ROUTES (the physical screen calls these)                */
/* ---------------------------------------------------------------------- */

// POST /api/displays/register
// Called once by a brand new screen with no stored credentials.
// Returns a deviceToken (store forever) and a pairingCode (show on screen).
router.post("/register", async (_req, res) => {
  const pairingCode = generatePairingCode();
  const deviceToken = generateDeviceToken();

  const display = await prisma.display.create({
    data: { pairingCode, deviceToken, status: "PENDING" },
  });

  res.status(201).json({
    deviceToken: display.deviceToken,
    pairingCode: display.pairingCode,
    displayId: display.id,
  });
});

// GET /api/displays/me
// The display polls this (with its deviceToken) to find out if/when
// an admin has claimed it, and to send a heartbeat (lastSeenAt).
router.get("/me", authDevice, async (req: DeviceRequest, res) => {
  const display = await prisma.display.update({
    where: { id: req.displayId },
    data: { lastSeenAt: new Date() },
    select: {
      id: true,
      name: true,
      status: true,
      pairingCode: true,
      orientation: true,
      playlistId: true,
    },
  });
  res.json(display);
});

// GET /api/displays/me/content
// Once paired, the player calls this to get its ordered playlist of media.
// Poll this every 15-30s, or rely on the "content-updated" socket event
// to refetch immediately when an admin makes a change.
router.get("/me/content", authDevice, async (req: DeviceRequest, res) => {
  const display = await prisma.display.findUnique({
    where: { id: req.displayId },
    include: {
      playlist: {
        include: { items: { include: { media: true }, orderBy: { order: "asc" } } },
      },
    },
  });

  if (!display) return res.status(404).json({ error: "Display not found" });

  await prisma.display.update({
    where: { id: display.id },
    data: { lastSeenAt: new Date() },
  });

  if (!display.playlist) {
    return res.json({ displayName: display.name, items: [] });
  }

  const items = display.playlist.items.map((item: (typeof display.playlist.items)[number]) => ({
    id: item.id,
    type: item.media.type,
    url: item.media.url,
    durationSecs: item.durationOverride ?? item.media.durationSecs,
  }));

  res.json({ displayName: display.name, playlistName: display.playlist.name, items });
});

/* ---------------------------------------------------------------------- */
/*  ADMIN-FACING ROUTES (the dashboard calls these, JWT-protected)        */
/* ---------------------------------------------------------------------- */

// GET /api/displays — list displays owned by the current user.
// Newly-registered (PENDING) displays are intentionally NOT listed here:
// their pairing code is only shown on the physical screen itself, and an
// admin claims one by typing that code in via POST /claim. Listing all
// pending displays here would leak other people's pairing codes.
router.get("/", authAdmin, async (req: AuthedRequest, res) => {
  const displays = await prisma.display.findMany({
    where: { ownerId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(displays);
});

// POST /api/displays/claim  { pairingCode, name }
// Admin types in the code shown on the physical screen to claim it.
router.post("/claim", authAdmin, async (req: AuthedRequest, res) => {
  const { pairingCode, name } = req.body;
  if (!pairingCode) return res.status(400).json({ error: "pairingCode is required" });

  const display = await prisma.display.findFirst({
    where: { pairingCode, status: "PENDING" },
  });
  if (!display) {
    return res.status(404).json({ error: "Invalid or already-used pairing code" });
  }

  const updated = await prisma.display.update({
    where: { id: display.id },
    data: {
      ownerId: req.userId,
      name: name ?? "New Display",
      status: "PAIRED",
      pairingCode: null, // one-time use
    },
  });

  res.json(updated);
});

// PATCH /api/displays/:id  { name?, playlistId?, orientation? }
router.patch("/:id", authAdmin, async (req: AuthedRequest, res) => {
  const display = await prisma.display.findUnique({ where: { id: req.params.id } });
  if (!display || display.ownerId !== req.userId) {
    return res.status(404).json({ error: "Display not found" });
  }

  const { name, orientation } = req.body;
  // Distinguish "playlistId not sent" (leave unchanged) from "playlistId sent as null"
  // (explicitly un-assign) — a plain `?? ` check can't tell these apart since
  // `null ?? fallback` evaluates to `fallback`, which would make it impossible
  // to ever clear a display's playlist.
  const playlistIdProvided = Object.prototype.hasOwnProperty.call(req.body, "playlistId");
  const playlistId = req.body.playlistId;

  if (playlistIdProvided && playlistId) {
    const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
    if (!playlist || playlist.ownerId !== req.userId) {
      return res.status(404).json({ error: "Playlist not found" });
    }
  }

  const updated = await prisma.display.update({
    where: { id: display.id },
    data: {
      name: name ?? display.name,
      playlistId: playlistIdProvided ? playlistId : display.playlistId,
      orientation: orientation ?? display.orientation,
    },
  });

  // Push a realtime "refresh now" signal to the display if it's connected.
  const io = req.app.get("io");
  io?.to(`display:${display.id}`).emit("content-updated");

  res.json(updated);
});

// DELETE /api/displays/:id — unpair / remove a display
router.delete("/:id", authAdmin, async (req: AuthedRequest, res) => {
  const display = await prisma.display.findUnique({ where: { id: req.params.id } });
  if (!display || display.ownerId !== req.userId) {
    return res.status(404).json({ error: "Display not found" });
  }
  await prisma.display.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
