export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type ApiRequestInput = {
  baseUrl: string
  apiKey: string
  path: string
  method?: HttpMethod
  body?: unknown
  headers?: Record<string, string>
}

const buildUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`

export const apiRequest = async <T = unknown>(input: ApiRequestInput): Promise<T> => {
  const { baseUrl, apiKey, path, method = "GET", body, headers = {} } = input
  const url = buildUrl(baseUrl, path)

  const finalHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    ...headers,
  }
  if (body !== undefined && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json"
  }

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(
      `API ${method} ${url} -> ${res.status}: ${errText.slice(0, 400)}`,
    )
  }

  const ct = res.headers.get("content-type") ?? ""
  if (ct.includes("application/json")) {
    return (await res.json()) as T
  }
  return (await res.text()) as T
}
