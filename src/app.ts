import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import { config } from "./config/env.js"
import { chatRouter } from "./modules/chat/chat.controller.js"
import { errorsMiddleware } from "./middlewares/errors.middleware.js"

const app = express()

app.use(
  helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }),
)
app.use(
  cors({
    origin: config.corsOrigin.split(",").map((s) => s.trim()),
    credentials: true,
  }),
)
app.use(morgan("dev"))

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "lookmax-backend" })
})

app.use("/api", chatRouter)

app.use(errorsMiddleware)

export default app
