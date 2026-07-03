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

const findLastReference = (history: Msg[]): string | null => {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]
    if (m && m.role === "user" && m.imageSrc && m.text?.startsWith("Референс:")) {
      return m.text
    }
  }
  return null
}

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
    return {
      text: `Фото не подходит: ${reason}. Загрузите фото человека по пояс или в полный рост, в хорошем качестве и нормальной позе.`,
      image: null,
    }
  }

  const result = await generateDressedImage(
    first,
    text,
    findLastReference(history) ?? undefined,
  )
  if (!result.imageBuffer) {
    return { text: "Ошибка генерации картинки", image: null }
  }

  const reply = result.text.trim() || `Готово! Запрос: "${text || "(без текста)"}".`
  return { text: reply, image: result.imageBuffer }
}

const upstreamErrorText = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : String(err)
  if (/^API\s+\w+\s+https?:\/\/\S+\s+->\s+\d{3}/i.test(msg)) {
    return "Сервис генерации временно недоступен. Попробуйте ещё раз через минуту."
  }
  return "Не удалось обработать запрос. Попробуйте ещё раз."
}

export const chatService = {
  async process(input: ProcessChatInput): Promise<ProcessChatResult> {
    const history = parseMessages(input.rawMessages)

    if (input.files.length === 0) {
      return {
        text: "Пришлите фотографию для генерации контента",
        image: null,
      }
    }

    if (!isAiConfigured()) {
      return {
        text: `AI не настроен (ROUTERAI_API_KEY). Получил ${input.files.length} фото, запрос: "${input.text || "(без текста)"}".`,
        image: null,
      }
    }

    try {
      return await aiFlow(input.text, history, input.files)
    } catch (err) {
      console.error(
        `[chat] upstream failure: ${err instanceof Error ? err.message : String(err)}`,
      )
      return { text: upstreamErrorText(err), image: null }
    }
  },
}
