import { apiRequest } from "../services/api.service.js"
import { config } from "./env.js"

type Role = "user" | "assistant" | "system"

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export type ChatMessage = {
  role: Role
  content: string | ContentPart[]
}

export type ChatResponse = {
  choices?: {
    message?: {
      role?: string
      content?: string | ContentPart[] | null
      images?: { type: "image_url"; image_url: { url: string } }[]
    }
  }[]
}

export type ImagesResponse = {
  data?: { b64_json?: string }[]
}

const fetchRouterai = <T>(path: string, body?: unknown): Promise<T> =>
  apiRequest<T>({
    baseUrl: config.routerai.baseUrl,
    apiKey: config.routerai.apiKey,
    path,
    method: body === undefined ? "GET" : "POST",
    body,
  })

export const listModels = (): Promise<unknown> => fetchRouterai("/models")

export const chatCompletions = (
  model: string,
  messages: ChatMessage[],
  extra: Record<string, unknown> = {},
): Promise<ChatResponse> =>
  fetchRouterai<ChatResponse>("/chat/completions", { model, messages, ...extra })

export const generateImage = (
  model: string,
  prompt: string,
  referenceDataUrls: string[],
): Promise<ImagesResponse> =>
  fetchRouterai<ImagesResponse>("/images", {
    model,
    prompt,
    input_references: referenceDataUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
  })