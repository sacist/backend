import type { ErrorRequestHandler } from "express"
import type { AppError } from "../errors/app-error.js"

export const errorsMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  const status = error.statusCode || 500
  const code = error.code || error.statusCode || 500
  const text = error.text || error.message || "UnexpectedError"

  if (status >= 500) {
    console.error(`Error in ${req.originalUrl}`, { code, text })
  } else {
    console.warn(`Error in ${req.originalUrl}`, { code, text })
  }

  return res.status(status).json({ error: text, code })
}
