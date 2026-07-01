import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export interface DeviceRequest extends Request {
  displayId?: string;
}

/**
 * Protects display-facing routes. Expects:
 *   Authorization: Bearer <deviceToken>
 * The deviceToken is issued once at registration and stored permanently
 * on the physical screen (e.g. localStorage in the player).
 */
export async function authDevice(req: DeviceRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const deviceToken = header.slice("Bearer ".length);

  const display = await prisma.display.findUnique({ where: { deviceToken } });
  if (!display) {
    return res.status(401).json({ error: "Unknown device token" });
  }

  req.displayId = display.id;
  next();
}
