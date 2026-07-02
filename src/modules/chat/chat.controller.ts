import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import { upload } from "../../middlewares/upload.middleware.js"
import { config } from "../../config/env.js"
import { chatService } from "./chat.service.js"

class ChatController {
  public handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const text = typeof req.body.text === "string" ? req.body.text : ""
      const files = (req.files as Express.Multer.File[] | undefined) ?? []

      const result = await chatService.process({
        text,
        rawMessages: req.body.messages,
        files,
      })

      res.json({
        text: result.text,
        image: result.image ? result.image.toString("base64") : null,
      })
    } catch (err) {
      next(err)
    }
  }
}

export const chatController = new ChatController()

export const chatRouter = Router()

chatRouter.post("/chat", upload.array("files", config.maxFiles), chatController.handle)
