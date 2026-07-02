export interface AppError extends Error {
  statusCode?: number
  code?: string | number
  text?: string
}
