import multer from "multer"
import { config } from "../config/env.js"

const allowedMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (allowedMime.has(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`))
  }
}

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
    files: config.maxFiles,
  },
})
