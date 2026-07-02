import { ensureJpeg, renderLookJpg } from "../../helpers/image.helper.js"
import {
  generateDressedImage,
  isConfigured as isAiConfigured,
  validatePhoto,
} from "../../services/routerai.service.js"
import type {
  Msg,
  ProcessChatInput,
  ProcessChatResult,
} from "./chat.types.js"

const parseMessages = (raw: unknown): Msg[] => {
  if (typeof raw !== "string" || raw.length === 0) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m): m is Msg =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as Msg).id === "string" &&
        ((m as Msg).role === "user" || (m as Msg).role === "assistant"),
    )
  } catch {
    return []
  }
}

const buildAiReply = (
  text: string,
  attached: number,
  historyLen: number,
): string => {
  if (text.trim().length === 0 && attached === 0) {
    return "Расскажите подробнее, какой образ вы хотите подобрать."
  }
  return `Принял запрос: "${text || "(без текста)"}". Учёл ${attached} фото и ${historyLen} предыдущих сообщений.`
}

const buildFallbackReply = (
  text: string,
  attached: number,
  historyLen: number,
): string =>
  attached > 0
    ? `AI не настроен (ROUTERAI_API_KEY). Получил ${attached} фото, запрос: "${text || "(без текста)"}".`
    : buildAiReply(text, attached, historyLen)

const aiFlow = async (
  text: string,
  history: Msg[],
  files: Express.Multer.File[],
): Promise<ProcessChatResult> => {
  const first = files[0]
  if (!first) {
    throw new Error("aiFlow called without files")
  }

  const validation = await validatePhoto(first)
  if (!validation.ok) {
    const reason = validation.reason || "фото не подходит для примерки"
    const reply = `Фото не подходит: ${reason}. Загрузите фото человека по пояс или в полный рост, в хорошем качестве и нормальной позе.`
    const jpg = await renderLookJpg(text, files.length, "Фото не подходит")
    return {
      jpg,
      headers: {
        "X-Assistant-Text": encodeURIComponent(reply),
        "X-Attached-Count": String(files.length),
        "X-History-Length": String(history.length),
        "X-Validation-Error": "1",
      },
    }
  }

  const result = await generateDressedImage(first, text)
  const jpg = result.imageBuffer
    ? await ensureJpeg(result.imageBuffer)
    : await renderLookJpg(text, files.length, "AI не вернул изображение")
  const reply =
    result.text.trim() ||
    `Готово! Запрос: "${text || "(без текста)"}".`

  return {
    jpg,
    headers: {
      "X-Assistant-Text": encodeURIComponent(reply),
      "X-Attached-Count": String(files.length),
      "X-History-Length": String(history.length),
    },
  }
}

const placeholderFlow = async (
  text: string,
  history: Msg[],
  files: Express.Multer.File[],
): Promise<ProcessChatResult> => {
  const reply = buildFallbackReply(text, files.length, history.length)
  const jpg = await renderLookJpg(text, files.length)
  return {
    jpg,
    headers: {
      "X-Assistant-Text": encodeURIComponent(reply),
      "X-Attached-Count": String(files.length),
      "X-History-Length": String(history.length),
    },
  }
}

export const chatService = {
  async process(input: ProcessChatInput): Promise<ProcessChatResult> {
    const history = parseMessages(input.rawMessages)
    if (input.files.length > 0 && isAiConfigured()) {
      return aiFlow(input.text, history, input.files)
    }
    return placeholderFlow(input.text, history, input.files)
  },
}
