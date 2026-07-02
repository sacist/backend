import "dotenv/config"

import { config } from "./config/env.js"

const main = async (): Promise<void> => {
  if (!config.routerai.apiKey) {
    console.log("FAIL: ROUTERAI_API_KEY is not set")
    process.exitCode = 1
    return
  }

  const url = `${config.routerai.baseUrl}`
  const body = {
    model: config.routerai.validationModel,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 16,
  }

  console.log(`POST ${url}`)
  console.log(`model: ${body.model}`)

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.routerai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  console.log(`status: ${res.status}`)
  const text = await res.text()
  console.log(text)
}

main().catch((err) => {
  console.log(`FAIL: ${(err as Error).message}`)
  process.exitCode = 1
})
