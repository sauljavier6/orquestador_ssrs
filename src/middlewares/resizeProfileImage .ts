import fs from "fs";
import path from "path";
import sharp from "sharp";
import { Request, Response, NextFunction } from "express";

export const resizeProfileImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) return next();

    const uploadDir = path.join(__dirname, "../../uploads/profiles");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const uniqueName = `Profile-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
    const outputPath = path.join(uploadDir, uniqueName);

    await sharp(file.buffer)
      .resize(400, 400, { fit: "cover" })
      .toFormat("webp", { quality: 80 })
      .toFile(outputPath);

    file.filename = uniqueName;
    file.path = outputPath;

    next();
  } catch (error) {
    console.error("Error en resizeProfileImage:", error);
    next(error);
  }
};