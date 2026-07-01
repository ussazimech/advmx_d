import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { authAdmin, AuthedRequest } from "../middleware/authAdmin";

const router = Router();

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/;
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i;

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB ceiling for demo
  fileFilter: (_req, file, cb) => {
    // Some clients (curl, some mobile browsers) send a generic mimetype like
    // application/octet-stream instead of the real one. Fall back to
    // checking the file extension so legitimate uploads aren't rejected.
    const mimeOk = ALLOWED_MIME.test(file.mimetype);
    const extOk = ALLOWED_EXT.test(file.originalname);
    if (!mimeOk && !extOk) {
      return cb(new Error("Unsupported file type. Use jpg, png, webp, gif, mp4, webm, or mov."));
    }
    cb(null, true);
  },
});

// All routes below require a logged-in dashboard user
router.use(authAdmin);

// POST /api/media  (multipart/form-data, field name "file")
// Optional body fields: durationSecs (for images)
router.post("/", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded (field name must be 'file')" });
  }

  const VIDEO_EXT = /\.(mp4|webm|mov)$/i;
  const isVideo =
    req.file.mimetype.startsWith("video/") || VIDEO_EXT.test(req.file.originalname);
  const durationSecs = req.body.durationSecs ? parseInt(req.body.durationSecs, 10) : 10;

  const asset = await prisma.mediaAsset.create({
    data: {
      type: isVideo ? "VIDEO" : "IMAGE",
      url: `/uploads/${req.file.filename}`,
      filename: req.file.originalname,
      sizeBytes: req.file.size,
      durationSecs: isVideo ? 0 : durationSecs, // video duration is driven by the file itself in the player
      ownerId: req.userId as string,
    },
  });

  res.status(201).json(asset);
});

// GET /api/media  — list current user's media library
router.get("/", async (req: AuthedRequest, res) => {
  const assets = await prisma.mediaAsset.findMany({
    where: { ownerId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(assets);
});

// DELETE /api/media/:id
router.delete("/:id", async (req: AuthedRequest, res) => {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
  if (!asset || asset.ownerId !== req.userId) {
    return res.status(404).json({ error: "Media not found" });
  }

  // Remove the physical file (best-effort)
  const filePath = path.join(UPLOAD_DIR, path.basename(asset.url));
  fs.unlink(filePath, () => {});

  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  res.status(204).send();
});

export default router;
