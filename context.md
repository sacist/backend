# Context — LookMAX

Документ для будущих сессий (AI или human агентов). Описывает что построено, какие решения приняты, что ломается.

## Что это

LookMAX — ИИ-стилист. Next.js фронт + Express бэкенд, генерирует "одетого" человека через RouterAI.

## Backend (`C:\Users\andre\Desktop\shit\backend`)

```
src/
  index.ts                entry: dotenv + app.listen + SIGINT/SIGTERM shutdown
  app.ts                  Express: helmet/cors/morgan, /health, /api, errorsMiddleware
  config/env.ts           все env vars (config.routerai.*, port, host, corsOrigin, ...)
  errors/app-error.ts     AppError { statusCode, code, text }
  middlewares/
    errors.middleware.ts       errorsMiddleware: ErrorRequestHandler
    upload.middleware.ts       multer.memoryStorage + fileFilter (jpeg/png/webp/gif)
  helpers/image.helper.ts escapeXml, buildLookSvg, renderLookJpg, ensureJpeg (sharp)
  services/
    routerai.service.ts   isConfigured, validatePhoto, generateDressedImage
  modules/chat/
    chat.types.ts         Role, Msg, ProcessChatInput, ProcessChatResult
    chat.service.ts       chatService.process({text, rawMessages, files})
    chat.controller.ts    class ChatController { handle = async }, chatRouter
tmp/                      временные JPG, удаляются на res.finish/res.close
uploads/                  НЕ используется (multer держит файл в памяти)
```

## Конвенции кода (референс `~/Desktop/daily_back`)

- **Без `;`** — ни одна строка не заканчивается на терминатор. `;` допустимы только внутри строк/regex.
- **Все `function` → arrow**:
  - top-level: `const num = (...) => ...`
  - сервисы: `export const chatService = { async process(input) { ... } }` (shorthand)
  - классы: `class ChatController { public handle = async (...) => { ... } }`
  - middleware: `export const errorsMiddleware: ErrorRequestHandler = (err, req, res, _next) => { ... }`
- **ESM**: `"type": "module"` в package.json, импорты с `.js` (даже для .ts файлов).
- **dotenv** грузится первой строкой в `src/index.ts`, ДО всех остальных импортов (иначе `config/env.ts` не увидит ключи — модули ESM грузятся в обратном порядке).

## API контракт: `POST /api/chat`

**Request:** `multipart/form-data`
- `text` (string) — описание образа
- `messages` (string) — JSON-stringified `Msg[]` (предыдущие сообщения)
- `files` (File[]) — изображения, до 8 штук, до 10MB каждый

**Response:** `image/jpeg` (бинарный)
- `X-Assistant-Text` (url-encoded) — текст ответа
- `X-Attached-Count`, `X-History-Length` — мета
- `X-Validation-Error: 1` — если фото не подошло
- `Content-Disposition: inline; filename="look.jpg"`

## AI flow (когда есть файлы + `ROUTERAI_API_KEY`)

В `services/routerai.service.ts`:

1. **Валидация** → `POST {BASE}/chat/completions` с `model: google/gemini-2.0-flash-001` (дешёвая, vision). Промпт просит JSON `{"ok": bool, "reason": "..."}`. Если `ok=false` → возвращаем placeholder + `X-Validation-Error: 1`.

2. **Генерация** → `POST {BASE}/images` с `model: openai/gpt-image-1-mini` (дешёвая image-to-image, до 16 референсов). Body: `{model, prompt, input_references: [{type: "image_url", image_url: {url: dataUrl}}]}`. Ответ: `{data: [{b64_json: "..."}]}` → Buffer → `sharp().jpeg()`.

Без файлов или без ключа — fallback на SVG-плейсхолдер.

## Env (см. `.env.example`)

```
PORT=3001
HOST=0.0.0.0
MAX_FILE_SIZE_MB=10
MAX_FILES=8
CORS_ORIGIN=http://localhost:3000
ROUTERAI_API_KEY=             # ОБЯЗАТЕЛЬНО пополнить баланс на routerai.ru
ROUTERAI_BASE_URL=https://routerai.ru/api/v1
ROUTERAI_VALIDATION_MODEL=google/gemini-2.0-flash-001
ROUTERAI_GENERATION_MODEL=openai/gpt-image-1-mini
```

## Запуск

```bash
cd backend
cp .env.example .env       # вписать ROUTERAI_API_KEY
npm install
npm run dev                # tsx watch src/index.ts
```

## Frontend (`C:\Users\andre\Desktop\shit\frontend`)

Next.js 15 + React 19 + Tailwind v4. Главная — `app/page.tsx`.

Конфиги восстановлены после поломки: `postcss.config.mjs`, `next.config.ts`, добавлены `tailwindcss` + `@tailwindcss/postcss` в deps.

`app/page.tsx`:
- `API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"`
- `send()` шлёт FormData, читает JPG через `res.blob()` → `URL.createObjectURL`
- `X-Assistant-Text` декодируется из url-encoded
- 📎 через скрытый `<input type="file" multiple accept="image/*">`
- Превью над инпутом с × в углу (`removeAttachment`)

## Известные проблемы

### RouterAI 401 Unauthorized
API ключ работает для `GET /api/v1/models`, но НЕ для `chat/completions` или `images`. Причина: не пополнен баланс. Зайти на https://routerai.ru/settings/billing и пополнить.

### Два `page.tsx`
`backend/page.tsx` и `frontend/app/page.tsx` — одна и та же страница. Исторически фронт лежал в `backend/page.tsx`, потом переехал в `frontend/`. Сейчас синхронизируются через `Copy-Item` (SHA256 совпадают). Правишь одну → синхронизируй другую.

### `backend/page.tsx` лежит в `backend/`
Выглядит странно (бэкенд-папка содержит фронтовый файл), но это исторический факт. Не переносить в `frontend/` без явной просьбы — сломается синхронизация.

## Что сделано в этой сессии

1. Создан backend с нуля: package.json (express, multer 2.x, dotenv, cors, helmet, morgan, sharp, tsx), tsconfig (ESM, strict)
2. `POST /api/chat`: multer (memoryStorage), парсинг FormData, sharp JPEG-генерация из SVG, отдача с `res.once("finish"/"close")` cleanup
3. Интеграция RouterAI: дешёвая vision для валидации → дешёвая image-to-image для генерации
4. Создан `frontend/app/page.tsx` (Next.js 15 app router)
5. Восстановлены сломанные конфиги фронта: postcss, next.config, tailwind в deps
6. Рефакторинг backend под архитектуру `daily_back`: без `;`, arrow functions, layered (index/app/router/controller/service)
