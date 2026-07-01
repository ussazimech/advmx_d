import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import http from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/auth";
import mediaRoutes from "./routes/media";
import playlistRoutes from "./routes/playlists";
import displayRoutes from "./routes/displays";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set("io", io);

app.use(cors());
app.use(express.json());

// Serve uploaded media files directly
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Serve the basic fullscreen player at /player.html
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (_req, res) => res.json({ ok: true, service: "signage-cms" }));

app.use("/api/auth", authRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/playlists", playlistRoutes);
app.use("/api/displays", displayRoutes);

// Centralized error handler — catches multer errors (bad file type, too large)
// and anything else thrown synchronously in a route, returning JSON instead
// of Express's default HTML error page.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 400);
  res.status(status).json({ error: err.message || "Unexpected server error" });
});

// Socket.io: each display joins a room named after its own id so the
// server can push a targeted "content-updated" event to just that screen.
io.on("connection", (socket) => {
  socket.on("join", (displayId: string) => {
    if (displayId) socket.join(`display:${displayId}`);
  });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
server.listen(PORT, () => {
  console.log(`signage-cms backend listening on http://localhost:${PORT}`);
});
