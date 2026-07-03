# Context — LookMAX

Документ для будущих сессий (AI или human агентов). Описывает что построено, какие решения приняты, что ломается.

## Что это

LookMAX — ИИ-стилист. Next.js фронт + Express бэкенд, генерирует "одетого" человека через RouterAI.

## Backend (`C:\Users\andre\Desktop\shit\backend`)

```
src/
  index.ts                entry: dotenv + app.listen + SIGINT/SIGTERM shutdown
  app.ts                  Express: helmet/cors/morgan, /health, /api, errorsMiddleware
  config/
    env.ts                все env vars (config.routerai.*, port, host, corsOrigin, ...)
    fetch-routerai.ts     RouterAI HTTP: listModels, chatCompletions, generateImage
  errors/app-error.ts     AppError { statusCode, code, text }
  middlewares/
    errors.middleware.ts       errorsMiddleware: ErrorRequestHandler
    upload.middleware.ts       multer.memoryStorage + fileFilter (jpeg/png/webp/gif)
  services/
    api.service.ts        универсальный apiRequest<T>({baseUrl, apiKey, path, method, body})
    routerai.service.ts   isConfigured, validatePhoto, generateDressedImage (бизнес-логика)
  modules/chat/
    chat.types.ts         Role, Msg, ProcessChatInput, ProcessChatResult
    chat.service.ts       chatService.process({text, rawMessages, files})
    chat.controller.ts    class ChatController { handle = async }, chatRouter
  test-routerai.ts        standalone smoke-test ключа (npm run test:routerai)
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

**Response:** `application/json`
```json
{ "text": "string", "image": "base64-jpg-or-null" }
```
- `text` — всегда есть, идёт в чат
- `image` — `null` если генерация не удалась / валидация не прошла / нет файлов; иначе base64-jpg (data URL собирается на фронте как `data:image/jpeg;base64,...`)

Никаких `X-Assistant-Text` хедеров, никакого `tmp/` на диске, никаких плейсхолдеров. Фронт сам решает показать ли картинку.

**Текст при ошибках:**
- `Пришлите фотографию для генерации контента` — текстовый запрос без фото (заглушка)
- `Ошибка генерации картинки` — AI вернул ответ без `b64_json`
- `Не получилось: {reason}. ...` — `validateRequest` зарезал запрос (см. ниже)
- `AI не настроен (ROUTERAI_API_KEY)...` — нет ключа (env не заполнен)
- `Сервис генерации временно недоступен. Попробуйте ещё раз через минуту.` — RouterAI вернул 4xx/5xx (любой upstream-сбой ловится в `chatService.process` и возвращается как обычный текст, а не 500)

## AI flow (когда есть файлы + `ROUTERAI_API_KEY`)

Трёхслойная архитектура HTTP-вызовов:

```
chat.service
  └─ routerai.service        (бизнес-логика: промпты, парсинг, fallback)
       └─ config/fetch-routerai  (RouterAI-специфичные эндпоинты)
            └─ services/api.service  (универсальный HTTP-клиент)
```

**`api.service.ts`** — `apiRequest<T>({baseUrl, apiKey, path, method, body, headers})`:
добавляет `Authorization: Bearer`, JSON-сериализацию, бросает `API {method} {url} -> {status}: {body}` на не-2xx.

**`config/fetch-routerai.ts`** — три функции над `apiRequest`:
- `listModels()` → `GET /models`
- `chatCompletions(model, messages, extra?)` → `POST /chat/completions`
- `generateImage(model, prompt, dataUrls[])` → `POST /images` (сам собирает `input_references`)

Wire-типы `ChatResponse` / `ImagesResponse` / `ChatMessage` лежат там же.

**`routerai.service.ts`** — бизнес-логика:

1. **Валидация + подготовка промпта** → `validateRequest(text, files)` в `routerai.service` дёргает `chatCompletions(openai/gpt-4o-mini, …)` одним вызовом. В prompt уходит текст пользователя (≤ 600 символов) и ВСЕ файлы: первый = фото человека, остальные = референсы образа. Модель проверяет три вещи и `ok=true` ТОЛЬКО если все три прошли: (а) текст описывает стиль/повод/одежду ИЛИ приложен референс; (б) первое фото — человек по пояс/в рост лицом/полубоком; (в) референсы 2..N — фото одежды/лука, не рандом. Если `ok=false` — `chat.service` возвращает текст `Не получилось: {reason}. …` без `image`. **Если `ok=true`, модель заодно возвращает `generationPrompt` (200–400 символов, готовый промпт для image-модели) и `normalizedText` (≤ 200 символов, очищенная формулировка).** `generationPrompt` прокидывается в `generateDressedImage` как `presetPrompt`; если он короче 50 символов — fallback на старый ручной шаблон с warn в лог. `normalizedText` пока не используется, зарезервирован на будущее (UI «AI понял запрос как: …»).

2. **Генерация** → `generateImage(openai/gpt-image-1-mini, fullPrompt, [dataUrl])`. Ответ: `{data: [{b64_json: "..."}]}` → Buffer → `sharp().jpeg()` для нормализации формата. Если `b64_json` нет → возвращаем текст `Ошибка генерации картинки` без `image`.

Без файлов или без ключа — `chat.service` сразу возвращает текст без `image` (без вызова AI).

Чтобы добавить новый API-сервис: создать `config/fetch-<name>.ts` по образцу + `services/<name>.service.ts` поверх. Универсальный слой не трогать.

## Env (см. `.env.example`)

```
PORT=3001
HOST=0.0.0.0
MAX_FILE_SIZE_MB=10
MAX_FILES=8
CORS_ORIGIN=http://localhost:3000
ROUTERAI_API_KEY=             # ОБЯЗАТЕЛЬНО пополнить баланс на routerai.ru
ROUTERAI_BASE_URL=https://routerai.ru/api/v1
ROUTERAI_VALIDATION_MODEL=openai/gpt-4o-mini
ROUTERAI_GENERATION_MODEL=openai/gpt-image-1-mini
```

## Запуск

```bash
cd backend
cp .env.example .env       # вписать ROUTERAI_API_KEY
npm install
npm run dev                # tsx watch src/index.ts
npm run test:routerai      # smoke-test ключа (POST /chat/completions + лог ответа)
```

## Frontend (`C:\Users\andre\Desktop\shit\frontend`)

Next.js 15 + React 19 + Tailwind v4. Главная — `app/page.tsx`.

Конфиги восстановлены после поломки: `postcss.config.mjs`, `next.config.ts`, добавлены `tailwindcss` + `@tailwindcss/postcss` в deps.

`app/page.tsx`:
- `API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"`
- `send()` шлёт FormData, парсит JSON `{text, image?}`, при наличии `image` собирает `data:image/jpeg;base64,...` data URL
- Если `image` нет — сообщение в чате только с текстом
- 📎 через скрытый `<input type="file" multiple accept="image/*">`
- Превью над инпутом с × в углу (`removeAttachment`)

## Известные проблемы

### RouterAI 401 Unauthorized
API ключ работает для `GET /api/v1/models`, но НЕ для `chat/completions` или `images`. Причина: не пополнен баланс. Зайти на https://routerai.ru/settings/billing и пополнить.

### RouterAI 503 / "No available providers for model …"
Модель из `ROUTERAI_VALIDATION_MODEL` не зарегана у RouterAI или не имеет провайдера. Проверить актуальный список: `curl -H "Authorization: Bearer $ROUTERAI_API_KEY" https://routerai.ru/api/v1/models | jq '.data[].id'`. Текущий рабочий default — `openai/gpt-4o-mini` (vision + chat). Альтернативы: `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`, `google/gemini-2.5-flash`.

## Что сделано в этой сессии

1. Создан backend с нуля: package.json (express, multer 2.x, dotenv, cors, helmet, morgan, sharp, tsx), tsconfig (ESM, strict)
2. `POST /api/chat`: multer (memoryStorage), парсинг FormData, sharp JPEG-генерация из SVG, отдача с `res.once("finish"/"close")` cleanup
3. Интеграция RouterAI: дешёвая vision для валидации → дешёвая image-to-image для генерации
4. Создан `frontend/app/page.tsx` (Next.js 15 app router)
5. Восстановлены сломанные конфиги фронта: postcss, next.config, tailwind в deps
6. Рефакторинг backend под архитектуру `daily_back`: без `;`, arrow functions, layered (index/app/router/controller/service)
7. Создан `src/test-routerai.ts` (smoke-test API ключа) + npm script `test:routerai`
8. **Рефакторинг HTTP-слоя на 3 уровня**: `services/api.service.ts` (универсальный) → `config/fetch-routerai.ts` (RouterAI wrapper) → `services/routerai.service.ts` (бизнес-логика). Сырой `fetch()` из routerai.service убран. Готово к добавлению новых API-сервисов по тому же шаблону.
9. **Удалён SVG/JPG-плейсхолдер** (`src/helpers/image.helper.ts` целиком). API переведён с `image/jpeg` бинарного ответа на `application/json {text, image?}` — фронт парсит JSON, image через data URL. При любой ошибке генерации в чат уходит текст (`Ошибка генерации картинки`, `Фото не подходит: ...`, `AI не настроен...`). Папка `tmp/` и `res.once("finish"/"close")` cleanup больше не нужны. `sharp` остался — используется в `routerai.service` для нормализации формата ответа AI в JPG.
10. **Upstream errors больше не → 500**. `chatService.process` оборачивает `aiFlow` в `try/catch`: любой `throw` из `validatePhoto` / `generateDressedImage` (включая `API POST … -> 503` от `apiRequest`) логируется в консоль и возвращается фронту как `{text: "Сервис генерации временно недоступен. Попробуйте ещё раз через минуту.", image: null}`. HTTP-статус остаётся 200, фронт просто показывает текст.
11. **`ROUTERAI_VALIDATION_MODEL` переключён на `openai/gpt-4o-mini`**. `google/gemini-2.0-flash-001` стал невалидным у RouterAI ("No available providers"), `openai/gpt-image-1-mini` не поддерживает `/chat/completions` с vision (503). `gpt-4o-mini` — дешёвая vision-модель с chat-эндпоинтом. Поменяно в `.env`, `.env.example` и default в `config/env.ts`.
12. **Валидация расширена до `validateRequest(text, files)`**. Раньше `validatePhoto` смотрел только на первое фото и пускал в генерацию любой текст. Теперь prompt у vision-модели один вызов: (а) проверяет текст — есть ли явный стиль/look/повод/одежда, иначе при отсутствии референса отказ; (б) проверяет первое фото — человек по пояс/в рост лицом/полубоком; (в) проверяет референсы 2..N — фото одежды/лука, не рандом. `ok=true` только если прошли все три. Reason в ответе модели идёт прямо в чат (`Не получилось: {reason}. …`). Старая `validatePhoto` удалена.
13. **Валидатор теперь ещё и готовит промпт для генерации**. `validateRequest` при `ok=true` возвращает `generationPrompt` (200–400 символов на русском, готовый к передаче в image-модель) и `normalizedText` (≤ 200 символов, очищенная формулировка запроса). `generationPrompt` прокидывается в `generateDressedImage` как `presetPrompt`: если длина ≥ 50 символов — используется напрямую, иначе fallback на ручной шаблон с warn в лог. `normalizedText` пока не отдаётся фронту — зарезервирован на будущее. Парсинг JSON расширен, обратная совместимость с короткими ответами `{ok, reason}` сохранена.
