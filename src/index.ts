import "dotenv/config"

import app from "./app.js"
import { config } from "./config/env.js"

const start = (): void => {
  const server = app.listen(config.port, config.host, () => {
    console.log(
      `lookmax-backend listening on http://${config.host}:${config.port}`,
    )
  })

  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}. Shutting down...`)
    server.close(() => {
      console.log("Server stopped cleanly")
      process.exit(0)
    })
  }

  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

start()
