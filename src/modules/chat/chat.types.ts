export type Role = "user" | "assistant"

export type Msg = {
  id: string
  role: Role
  text?: string
  imageSrc?: string
  imageAlt?: string
}

export type ProcessChatInput = {
  text: string
  rawMessages: unknown
  files: Express.Multer.File[]
}

export type ProcessChatResult = {
  text: string
  image: Buffer | null
}
