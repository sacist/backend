import { Router } from "express"
import path from "node:path"
import fs from "node:fs"
import fsp from "node:fs/promises"
import { randomUUID } from "node:crypto"
import type { Request, Response, NextFunction } from "express"
import { upload } from "../../middlewares/upload.middleware.js"
import { config } from "../../config/env.js"
import { chatService } from "./chat.service.js"

const tmpDir = path.resolve(process.cwd(), "tmp")
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true })
}

const scheduleUnlink = (filePath: string, res: Response): void => {
  const unlink = () => {
    fsp.unlink(filePath).catch(() => {})
  }
  res.once("finish", unlink)
  res.once("close", unlink)
}

class ChatController {
  public handle = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const text = typeof req.body.text === "string" ? req.body.text : ""
      const files =
        (req.files as Express.Multer.File[] | undefined) ?? []

      const result = await chatService.process({
        text,
        rawMessages: req.body.messages,
        files,
      })

      const tmpName = `${randomUUID()}.jpg`
      const tmpPath = path.join(tmpDir, tmpName)
      await fsp.writeFile(tmpPath, result.jpg)

      res.setHeader("Content-Type", "image/jpeg")
      res.setHeader("Content-Disposition", 'inline; filename="look.jpg"')
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, v)
      }

      scheduleUnlink(tmpPath, res)
      res.sendFile(tmpPath, (err) => {
        if (err && !res.headersSent) next(err)
      })
    } catch (err) {
      next(err)
    }
  }
}

export const chatController = new ChatController()

export const chatRouter = Router()

chatRouter.post("/chat", upload.array("files", config.maxFiles), chatController.handle)
