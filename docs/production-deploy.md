# TouchSpace Chat: production deploy

## Что важно понять

Сейчас проект уже можно запускать не только локально, но сам по себе он ещё не "в проде", пока:

- frontend не опубликован на реальном домене
- backend не опубликован на реальном домене
- настроены продовые env
- включён HTTPS
- web push работает с реальными VAPID-ключами

То есть ответ на вопрос "всё ли сейчас локально" такой:

- да, интерфейсы и backend по умолчанию ориентированы на локальный запуск
- база данных уже может быть удалённой, если `DATABASE_URL` указывает на внешний Postgres
- чтобы системой пользовались с любого компьютера, нужно развернуть frontend и backend наружу

## Что уже подготовлено

В проект добавлены production-ready заготовки:

- backend Docker image: [Dockerfile](/Users/aknila/Desktop/touchspace-chat/backend/Dockerfile)
- frontend Docker image: [Dockerfile](/Users/aknila/Desktop/touchspace-chat/frontend/Dockerfile)
- compose для совместного запуска: [docker-compose.prod.yml](/Users/aknila/Desktop/touchspace-chat/docker-compose.prod.yml)
- dockerignore:
  - [backend/.dockerignore](/Users/aknila/Desktop/touchspace-chat/backend/.dockerignore)
  - [frontend/.dockerignore](/Users/aknila/Desktop/touchspace-chat/frontend/.dockerignore)
- env examples:
  - [backend/.env.example](/Users/aknila/Desktop/touchspace-chat/backend/.env.example)
  - [frontend/.env.example](/Users/aknila/Desktop/touchspace-chat/frontend/.env.example)

## Рекомендуемая production-схема

Минимально разумная схема для pilot / internal production:

1. Домен для frontend:
   - `https://chat.touchspace.biz`
2. Backend API на том же домене:
   - `https://chat.touchspace.biz/api`
3. Один внешний Postgres
4. HTTPS через reverse proxy
5. Backend и frontend в отдельных контейнерах

## Обязательные backend env

Пример:

```env
DATABASE_URL=postgresql://...
CORS_ORIGIN=https://chat.touchspace.biz
PORT=3001

OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=gpt-5-mini
OPENAI_ADMIN_MODEL=gpt-5-mini

WEB_PUSH_PUBLIC_KEY=...
WEB_PUSH_PRIVATE_KEY=...
WEB_PUSH_SUBJECT=mailto:ops@touchspace.ru
```

## Обязательные frontend env

Пример:

```env
NEXT_PUBLIC_API_BASE_URL=https://chat.touchspace.biz/api
NEXT_PUBLIC_APP_URL=https://chat.touchspace.biz
```

## Как поднять через Docker Compose

На сервере:

1. Скопировать проект
2. Заполнить `backend/.env`
3. Экспортировать переменные для frontend build:

```bash
export NEXT_PUBLIC_API_BASE_URL=https://chat.touchspace.biz/api
export NEXT_PUBLIC_APP_URL=https://chat.touchspace.biz
```

4. Поднять контейнеры:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## Что ещё нужно на сервере

Docker Compose поднимет сами приложения, но для реального использования с любых компьютеров ещё нужен внешний вход:

- Nginx / Traefik / Caddy
- SSL-сертификаты
- DNS для доменов

## Важные product/tech notes

- PWA и system notifications полноценно работают только по HTTPS
- Web push тоже должен работать на реальном HTTPS-домене
- service worker не должен жить на `http://` в прод-режиме
- `NEXT_PUBLIC_API_BASE_URL` должен указывать на внешний backend, а не на localhost

## Что нужно от вас, чтобы реально вывести в прод

Я могу подготовить код и конфиги, но для фактической публикации нужны ваши инфраструктурные данные:

1. сервер или хостинг
2. домены
3. доступ к DNS
4. production env значения
5. VAPID keys для push
6. SSL / reverse proxy

## Самый практичный следующий шаг

Если хотите, следующий этап лучше делать так:

1. вы даёте целевую схему:
   - VPS / Railway / Render / Vercel + backend host / другой вариант
2. я под неё готовлю точные production-конфиги
3. затем вы подставляете секреты и выкатываете

Без доступа к вашей инфраструктуре я не смогу физически "опубликовать наружу" из этой сессии, но кодовая база уже подготовлена к этому гораздо лучше, чем раньше.
