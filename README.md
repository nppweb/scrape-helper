# scraper-service

![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)
![CD](https://img.shields.io/badge/CD-GitHub_Deploy-2ea44f?logo=github&logoColor=white)
![Container](https://img.shields.io/badge/Container-GHCR-2496ED?logo=docker&logoColor=white)

Сервис автоматического сбора данных с открытых веб-источников.

## Что делает этот репозиторий

- запускает задания сбора данных по cron;
- формирует raw-события формата `source.raw.v1`;
- валидирует события по JSON Schema;
- публикует события в RabbitMQ.

## Черновая реализация

- demo-source (`src/sources/demo-source.ts`) с опциональным использованием Playwright;
- расписание через `node-cron`;
- публикация в очередь через `amqplib`;
- валидация схемы из `shared-contracts/events/source-raw.v1.json`;
- Dockerfile и CI workflow.

## Локальный запуск

```bash
cp .env.example .env
npm install
npm run start:dev
```

## Важные переменные

- `RABBITMQ_URL`
- `QUEUE_RAW_EVENT`
- `SCRAPE_SCHEDULE`
- `USE_PLAYWRIGHT`
- `SHARED_CONTRACTS_DIR`

## Связи с другими репозиториями

- публикует события для `processing-worker`;
- использует контракты из `shared-contracts`.
