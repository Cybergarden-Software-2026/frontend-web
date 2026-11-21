# underCtrl Web

Дашборд ИТ-инцидентов на React, TypeScript и Vite.

В терминале VS Code: `./scripts/run.sh demo` — сайт с локальным тестовым API на http://127.0.0.1:5173/.
Для работы с Rust API запустите Compose в репозитории backend, установите зависимости (`pnpm install --frozen-lockfile`) и выполните `pnpm dev` здесь. Откройте http://127.0.0.1:5173/. Vite передаёт запросы `/api/v1` на `127.0.0.1:8080`. Для другого порта задайте `VITE_API_PROXY_TARGET` в `.env`; например, при SSH-туннеле к порту 8001 укажите `http://127.0.0.1:8001`.
Проверки: `./scripts/run.sh build`, `./scripts/run.sh test`.

Главная повторяет предоставленный макет: четыре группы и общий список, серверная пагинация, постоянные сигналы в хедере со звуком и анимацией, подсветка изменений и назначение команд. Rust API подбирает команды по правилам на основе завершённых инцидентов. Поиск массовых проблем показывает гипотезы с основаниями.

Контракт для backend: [docs/API.md](docs/API.md).
В режиме демо доступна симуляция с локальным адаптером SQLite и файлом `data/incidents.json`. При обычном запуске данные и события приходят из Rust API. Для назначения команды задайте `ASSIGNMENT_TOKEN` в `.env` бэкенда. Координатор вводит ключ в диалоге назначения, когда приложение его запросит. Для удалённого доступа с ключом используйте HTTPS.

Развёртывание из Git на Debian 13: [docs/DEPLOY-DEBIAN-13.md](docs/DEPLOY-DEBIAN-13.md) — пакеты, сборка, Nginx, API/SSE и HTTPS.

## Ручной запуск в Docker на vserver

Сначала запустите backend по разделу «Запуск на vserver» в его `DEPLOY.md`. Compose создаст сеть `mts-incident-dashboard_default`. Из корня frontend соберите образ:

```bash
sudo docker build --pull -t underctrl-frontend:manual .
```

При обновлении остановите и удалите старый контейнер `underctrl-frontend-manual` после успешной сборки. Запустите новый:

```bash
sudo docker run -d --name underctrl-frontend-manual --restart unless-stopped \
  --network mts-incident-dashboard_default \
  -p 127.0.0.1:8005:8080 underctrl-frontend:manual
curl --noproxy '*' -fsS http://127.0.0.1:8005/healthz
curl --noproxy '*' -fsS http://127.0.0.1:8005/api/v1/snapshot
curl --noproxy '*' -N --max-time 3 http://127.0.0.1:8005/api/v1/events/stream
```

Публичный Nginx передаёт весь трафик сайта на `127.0.0.1:8005`. Контейнер фронтенда раздаёт статику, проксирует `/api/` на сервис `api:8080` в сети Compose и отключает буферизацию для SSE. На странице и у API один origin. Если проект Compose был переименован через `-p`, замените имя сети на `<имя-проекта>_default`. После запуска проверьте, что snapshot возвращает JSON, а в потоке до истечения таймаута приходит `event: snapshot`.
