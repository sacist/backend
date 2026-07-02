import sharp from "sharp"
import { config } from "../config/env.js"
import {
  chatCompletions,
  generateImage,
  type ChatResponse,
} from "../config/fetch-routerai.js"

export type ValidationResult = { ok: boolean; reason: string }
export type GenerationResult = { text: string; imageBuffer: Buffer | null }

const fileToDataUrl = (file: Express.Multer.File): string => {
  const mime = file.mimetype || "image/jpeg"
  return `data:${mime};base64,${file.buffer.toString("base64")}`
}

const dataUrlToBuffer = (url: string): Buffer | null => {
  const m = /^data:[^;]+;base64,(.+)$/s.exec(url)
  if (!m || !m[1]) return null
  return Buffer.from(m[1], "base64")
}

const ensureJpeg = async (input: Buffer): Promise<Buffer> => {
  try {
    return await sharp(input).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
  } catch {
    return input
  }
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
  const res = await chatCompletions(config.routerai.validationModel, [
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
  referenceText?: string,
): Promise<GenerationResult> => {
  const dataUrl = fileToDataUrl(file)
  const userText = prompt.trim() || "стильный современный образ"
  const lines = [`Одень этого человека в: ${userText}.`]
  if (referenceText) {
    lines.push(`Учти стиль из референса: ${referenceText}.`)
  }
  lines.push(
    "Сохрани позу, лицо, телосложение, фон и общую композицию.",
    "Замени только одежду и аксессуары.",
    "Сгенерируй фотореалистичное изображение.",
  )
  const fullPrompt = lines.join("\n")

  if (!isConfigured()) throw new Error("ROUTERAI_API_KEY is not set")

  const json = await generateImage(
    config.routerai.generationModel,
    fullPrompt,
    [dataUrl],
  )
  const b64 = json.data?.[0]?.b64_json
  if (!b64) {
    console.warn(
      `[routerai] no b64_json in /images response (model=${config.routerai.generationModel})`,
      JSON.stringify(json).slice(0, 800),
    )
    return { text: "", imageBuffer: null }
  }
  return { text: "", imageBuffer: await ensureJpeg(Buffer.from(b64, "base64")) }
}
