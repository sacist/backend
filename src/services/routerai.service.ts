import { config } from "../config/env.js"

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

type Role = "user" | "assistant" | "system"

type Message = {
  role: Role
  content: string | ContentPart[]
}

type ImageRef = { type: "image_url"; image_url: { url: string } }

type ChatResponse = {
  choices?: Array<{
    message?: {
      role?: string
      content?: string | ContentPart[] | null
      images?: ImageRef[]
    }
  }>
}

type ImagesResponse = {
  data?: Array<{ b64_json?: string }>
}

export type ValidationResult = { ok: boolean; reason: string }
export type GenerationResult = { text: string; imageBuffer: Buffer | null }

const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${config.routerai.apiKey}`,
  "Content-Type": "application/json",
})

const fileToDataUrl = (file: Express.Multer.File): string => {
  const mime = file.mimetype || "image/jpeg"
  return `data:${mime};base64,${file.buffer.toString("base64")}`
}

const dataUrlToBuffer = (url: string): Buffer | null => {
  const m = /^data:[^;]+;base64,(.+)$/s.exec(url)
  if (!m || !m[1]) return null
  return Buffer.from(m[1], "base64")
}

const callChat = async (
  model: string,
  messages: Message[],
  extra: Record<string, unknown> = {},
): Promise<ChatResponse> => {
  if (!isConfigured()) throw new Error("ROUTERAI_API_KEY is not set")
  const res = await fetch(`${config.routerai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model, messages, ...extra }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`RouterAI chat ${res.status}: ${errText.slice(0, 400)}`)
  }
  return (await res.json()) as ChatResponse
}

const extractTextAndImage = (
  message: NonNullable<NonNullable<ChatResponse["choices"]>[0]>["message"],
): GenerationResult => {
  let text = ""
  let imageBuffer: Buffer | null = null

  if (!message) return { text: "", imageBuffer: null }

  const content = message.content
  if (typeof content === "string") {
    text = content
  } else if (Array.isArray(content)) {
    text = content
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")

    if (!imageBuffer) {
      const imgPart = content.find(
        (p): p is { type: "image_url"; image_url: { url: string } } =>
          p.type === "image_url" && "image_url" in p,
      )
      if (imgPart) imageBuffer = dataUrlToBuffer(imgPart.image_url.url)
    }
  }

  if (!imageBuffer && message.images) {
    for (const img of message.images) {
      const buf = dataUrlToBuffer(img.image_url.url)
      if (buf) {
        imageBuffer = buf
        break
      }
    }
  }

  return { text, imageBuffer }
}

export const isConfigured = (): boolean => config.routerai.apiKey.length > 0

export const validatePhoto = async (
  file: Express.Multer.File,
): Promise<ValidationResult> => {
  const dataUrl = fileToDataUrl(file)
  const res = await callChat(config.routerai.validationModel, [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "Ты валидатор фото для сервиса виртуальной примерки одежды.",
            "Реши, подходит ли фото. Ответь СТРОГО одним JSON без пояснений:",
            '{"ok": true|false, "reason": "короткая причина на русском, до 120 символов"}',
            "",
            "ok=true, если: один человек, виден по пояс или в полный рост,",
            "одежда видна, чёткое фото, нормальная поза (лицом/полубоком).",
            "",
            "ok=false, если: людей нет, группа, сильное размытие, ребёнок,",
            "животное, со спины, сильно обрезано, NSFW, посторонние объекты закрывают тело.",
          ].join("\n"),
        },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ])

  const message = res.choices?.[0]?.message
  const raw = typeof message?.content === "string" ? message.content : ""

  const jsonMatch = /\{[\s\S]*?"ok"[\s\S]*?\}/.exec(raw)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        ok?: unknown
        reason?: unknown
      }
      return {
        ok: parsed.ok === true,
        reason:
          typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "",
      }
    } catch {
      // fall through
    }
  }

  const ok = /"ok"\s*:\s*true|подходит|^yes$/i.test(raw.trim())
  return {
    ok,
    reason: raw.trim().slice(0, 200) || "Не удалось разобрать ответ",
  }
}

export const generateDressedImage = async (
  file: Express.Multer.File,
  prompt: string,
): Promise<GenerationResult> => {
  const dataUrl = fileToDataUrl(file)
  const userText = prompt.trim() || "стильный современный образ"
  const fullPrompt = [
    `Одень этого человека в: ${userText}.`,
    "Сохрани позу, лицо, телосложение, фон и общую композицию.",
    "Замени только одежду и аксессуары.",
    "Сгенерируй фотореалистичное изображение.",
  ].join("\n")

  if (!isConfigured()) throw new Error("ROUTERAI_API_KEY is not set")

  const res = await fetch(`${config.routerai.baseUrl}/images`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: config.routerai.generationModel,
      prompt: fullPrompt,
      input_references: [
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`RouterAI images ${res.status}: ${errText.slice(0, 400)}`)
  }

  const json = (await res.json()) as ImagesResponse
  const b64 = json.data?.[0]?.b64_json
  if (!b64) {
    const summary = JSON.stringify(json).slice(0, 800)
    console.warn(
      `[routerai] no b64_json in /images response (model=${config.routerai.generationModel})`,
      summary,
    )
    return { text: "AI не вернул изображение", imageBuffer: null }
  }
  return { text: "", imageBuffer: Buffer.from(b64, "base64") }
}
