# scrape-helper

Сервис автоматического сбора данных для NPPWEB.

## Что делает

- запускает задания по cron;
- собирает данные из реальных подключённых источников;
- формирует raw-события `source.raw.v1`;
- валидирует события по JSON Schema;
- публикует их в RabbitMQ;
- загружает артефакты в S3/MinIO, если они есть.

## Поддерживаемые источники

- `easuz`
- `eis`
- `rnp`
- `fedresurs`
- `fns`
- `gistorgi`

## Локальный запуск

Поднять зависимости:

```bash
cd ../infra
cp .env.example .env
docker compose --env-file .env -f docker-compose.yml -f docker-compose.apps.yml up -d rabbitmq minio minio-init
```

Запустить сервис:

```bash
cd ../scrape-helper
npm install
npm run start:dev
```

По умолчанию `SHARED_CONTRACTS_DIR` указывает на `../contracts`.

## ENABLED_SOURCES

Значение читается из env как список через запятую.

```env
ENABLED_SOURCES=eis
ENABLED_SOURCES=easuz,eis,rnp
ENABLED_SOURCES=easuz,eis,rnp,fedresurs,fns,gistorgi
```

Если указаны только неизвестные источники, сервис стартует без активных адаптеров и залогирует предупреждение.

## Важные env-переменные

- `RABBITMQ_URL`
- `QUEUE_RAW_EVENT`
- `QUEUE_QUARANTINE_EVENT`
- `SCRAPE_SCHEDULE`
- `SHARED_CONTRACTS_DIR`
- `ENABLED_SOURCES`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_FORCE_PATH_STYLE`
- `HTTP_PROXY`
- `HTTPS_PROXY`
- `NO_PROXY`

## Локальная проверка

1. Подними `infra`.
2. Запусти `scrape-helper` с `ENABLED_SOURCES=eis`.
3. Проверь логи на сообщения `loaded enabled sources`, `source run started`, `raw event published`.
4. Проверь очередь:

```bash
curl -u app:app http://localhost:15672/api/queues/%2F/source.raw.v1
```

## Проверка качества

```bash
npm run check
npm run test
npm run build
```

## Связи

- публикует события для `processing-worker`;
- использует схемы из `contracts`.
