const env = (name: string, fallback: string): string =>
  process.env[name] || fallback

const num = (name: string, fallback: number): number =>
  Number(env(name, String(fallback))) || fallback

export const config = {
  port: num("PORT", 3001),
  host: env("HOST", "0.0.0.0"),
  uploadDir: env("UPLOAD_DIR", "uploads"),
  maxFileSizeMb: num("MAX_FILE_SIZE_MB", 10),
  maxFiles: num("MAX_FILES", 8),
  corsOrigin: env("CORS_ORIGIN", "http://localhost:3000"),
  routerai: {
    apiKey: env("ROUTERAI_API_KEY", ""),
    baseUrl: env("ROUTERAI_BASE_URL", "https://routerai.ru/api/v1"),
    validationModel: env(
      "ROUTERAI_VALIDATION_MODEL",
      "google/gemini-2.0-flash-001",
    ),
    generationModel: env(
      "ROUTERAI_GENERATION_MODEL",
      "openai/gpt-image-1-mini",
    ),
  },
} as const
