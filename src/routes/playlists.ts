import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authAdmin, AuthedRequest } from "../middleware/authAdmin";

const router = Router();
router.use(authAdmin);

// GET /api/playlists — list current user's playlists with item counts
router.get("/", async (req: AuthedRequest, res) => {
  const playlists = await prisma.playlist.findMany({
    where: { ownerId: req.userId },
    include: { items: { include: { media: true }, orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(playlists);
});

// GET /api/playlists/:id
router.get("/:id", async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { media: true }, orderBy: { order: "asc" } } },
  });
  if (!playlist || playlist.ownerId !== req.userId) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  res.json(playlist);
});

// POST /api/playlists  { name }
router.post("/", async (req: AuthedRequest, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const playlist = await prisma.playlist.create({
    data: { name, ownerId: req.userId as string },
  });
  res.status(201).json(playlist);
});

// PATCH /api/playlists/:id  { name }
router.patch("/:id", async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } });
  if (!playlist || playlist.ownerId !== req.userId) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  const updated = await prisma.playlist.update({
    where: { id: req.params.id },
    data: { name: req.body.name ?? playlist.name },
  });
  res.json(updated);
});

// DELETE /api/playlists/:id
router.delete("/:id", async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } });
  if (!playlist || playlist.ownerId !== req.userId) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  await prisma.playlist.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// POST /api/playlists/:id/items  { mediaId, durationOverride? }
// Appends a media item to the end of the playlist.
router.post("/:id/items", async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!playlist || playlist.ownerId !== req.userId) {
    return res.status(404).json({ error: "Playlist not found" });
  }

  const { mediaId, durationOverride } = req.body;
  const media = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
  if (!media || media.ownerId !== req.userId) {
    return res.status(404).json({ error: "Media not found" });
  }

  const nextOrder = playlist.items.length;
  const item = await prisma.playlistItem.create({
    data: {
      playlistId: playlist.id,
      mediaId,
      order: nextOrder,
      durationOverride: durationOverride ?? null,
    },
    include: { media: true },
  });

  res.status(201).json(item);
});

// PATCH /api/playlists/:id/items/reorder  { itemIds: ["id1","id2",...] }
// Full reorder: pass all item ids in the new desired order.
router.patch("/:id/items/reorder", async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } });
  if (!playlist || playlist.ownerId !== req.userId) {
    return res.status(404).json({ error: "Playlist not found" });
  }

  const { itemIds } = req.body as { itemIds: string[] };
  if (!Array.isArray(itemIds)) {
    return res.status(400).json({ error: "itemIds must be an array" });
  }

  await prisma.$transaction(
    itemIds.map((id, index) =>
      prisma.playlistItem.update({ where: { id }, data: { order: index } })
    )
  );

  res.json({ ok: true });
});

// DELETE /api/playlists/:id/items/:itemId
router.delete("/:id/items/:itemId", async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } });
  if (!playlist || playlist.ownerId !== req.userId) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  await prisma.playlistItem.delete({ where: { id: req.params.itemId } });
  res.status(204).send();
});

export default router;
