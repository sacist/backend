import sharp from "sharp"

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

const wrapLines = (text: string, maxLineLen: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const w of words) {
    if ((line + " " + w).trim().length > maxLineLen) {
      lines.push(line.trim())
      line = w
    } else {
      line = (line + " " + w).trim()
    }
  }
  if (line) lines.push(line)
  if (lines.length === 0) lines.push("LookMAX")
  return lines
}

export const buildLookSvg = (
  prompt: string,
  attached: number,
  subline?: string,
): string => {
  const safePrompt = escapeXml(prompt.slice(0, 180))
  const lines = wrapLines(safePrompt, 28)
  const lineHeight = 34
  const startY = 360 - ((lines.length - 1) * lineHeight) / 2
  const tspans = lines
    .map(
      (l, i) =>
        `<tspan x="400" y="${startY + i * lineHeight}">${l}</tspan>`,
    )
    .join("")

  const caption =
    subline ??
    (attached > 0
      ? `На основе ${attached} референс${attached === 1 ? "а" : "ов"}`
      : "Без референсов")

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbcfe8"/>
      <stop offset="50%" stop-color="#c4b5fd"/>
      <stop offset="100%" stop-color="#bae6fd"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.4" r="0.6">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <rect width="800" height="800" fill="url(#glow)"/>
  <circle cx="400" cy="280" r="120" fill="#ffffff" opacity="0.55"/>
  <text x="400" y="295" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="120" fill="#7c3aed">&#10024;</text>
  <text font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="600" fill="#1e293b" text-anchor="middle">${tspans}</text>
  <text x="400" y="640" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#475569">${escapeXml(caption)}</text>
  <text x="400" y="740" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#64748b">LookMAX · AI-стилист</text>
</svg>`
}

export const renderLookJpg = async (
  prompt: string,
  attached: number,
  subline?: string,
): Promise<Buffer> => {
  const svg = buildLookSvg(prompt, attached, subline)
  return sharp(Buffer.from(svg))
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

export const ensureJpeg = async (input: Buffer): Promise<Buffer> => {
  try {
    return await sharp(input).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
  } catch {
    return input
  }
}
