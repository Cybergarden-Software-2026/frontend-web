# underCtrl Web

Дашборд ИТ-инцидентов на React, TypeScript и Vite.

В терминале VS Code: `./scripts/run.sh demo` — сайт с локальным тестовым API на http://127.0.0.1:5173/.
Для работы с Rust API запустите Compose в репозитории backend, установите зависимости (`pnpm install --frozen-lockfile`) и выполните `pnpm dev` здесь. Откройте http://127.0.0.1:5173/. Vite передаёт запросы `/api/v1` на `127.0.0.1:8080`. Для другого порта задайте `VITE_API_PROXY_TARGET` в `.env`; например, при SSH-туннеле к порту 8001 укажите `http://127.0.0.1:8001`.
Проверки: `./scripts/run.sh build`, `./scripts/run.sh test`.

Главная повторяет предоставленный макет: четыре группы и общий список, серверная пагинация, постоянные сигналы в хедере со звуком и анимацией, подсветка изменений и назначение команд. Rust API подбирает команды по правилам на основе завершённых инцидентов. Поиск массовых проблем показывает гипотезы с основаниями.

Общий контракт API: [API.md](API.md). Дополнительные правила интерфейса: [docs/API.md](docs/API.md).
В режиме демо доступна симуляция с локальным адаптером SQLite и файлом `data/incidents.json`. При обычном запуске данные и события приходят из Rust API. Для назначения команды задайте `ASSIGNMENT_TOKEN` в `.env` бэкенда. Координатор вводит ключ на экране входа; сохранённый ключ автоматически используется при назначении. Для удалённого доступа с ключом используйте HTTPS.

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

Для внешнего входа направьте трафик нужного виртуального хоста Nginx на `127.0.0.1:8005`. Контейнер фронтенда раздаёт статику, проксирует `/api/` на сервис `api:8080` в сети Compose и отключает буферизацию для SSE. На странице и у API один origin. Если проект Compose был переименован через `-p`, замените имя сети на `<имя-проекта>_default`. После запуска проверьте, что snapshot возвращает JSON, а в потоке до истечения таймаута приходит `event: snapshot`.

## Автоматическое обновление на vserver

После push или слияния изменений в `main` таймер vserver проверяет GitHub примерно раз в минуту. Git использует настроенный deploy key пользователя `cyber`. Docker собирает и тестирует конкретный коммит `main`. Перед заменой контейнера скрипт проверяет HTML, JS, звук, JSON-снимок и SSE на временном локальном порту. Рабочий контейнер доступен на `127.0.0.1:8005`. При сбое после переключения скрипт возвращает предыдущий контейнер. На время замены возможна короткая пауза.

Установите файлы из корня этого репозитория на vserver после запуска backend и слияния этой ветки в main:

```bash
sudo install -o root -g root -m 0755 deploy/deploy-frontend.sh /usr/local/sbin/underctrl-frontend-deploy
sudo install -o root -g root -m 0644 deploy/underctrl-frontend-deploy.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start underctrl-frontend-deploy.service
sudo systemctl enable --now underctrl-frontend-deploy.timer
sudo journalctl -u underctrl-frontend-deploy.service -n 40 --no-pager
```

Сервис ожидает Git-клон в `/home/cyber/cybergarden/frontend-web` с настроенным `origin`. Если имя сети Compose отличается, задайте `UNDERCTRL_FRONTEND_NETWORK` в drop-in сервиса systemd.

Внешний вход настраивается в существующем Nginx отдельно. Проверьте, что предназначенный для дашборда виртуальный хост направляет запросы на `127.0.0.1:8005`. Если снимки инцидентов требуют ограничения доступа, настройте аутентификацию на входе перед публикацией. Для SSE не буферизуйте поток и установите таймаут чтения больше интервала heartbeat.

Перед ручным обновлением остановите таймер и текущий запуск сервиса:

```bash
sudo systemctl stop underctrl-frontend-deploy.timer underctrl-frontend-deploy.service
```

Проверки GitHub Actions запускаются для push и pull request в `main`.

## Вход координатора

При обычном запуске введите ключ, выданный администратором backend (`ASSIGNMENT_TOKEN`). С флажком «Запомнить на этом устройстве» повторный вход после перезагрузки не требуется. Ключ автоматически используется для назначения команды. Выход и отказ сервера 401 сбрасывают сохранённую сессию. В текущем backend ключ проверяется при назначении, отдельного login/refresh endpoint пока нет; детали и границы этого режима описаны в `docs/API.md`. Для демонстрации без ключа используйте `./scripts/run.sh demo`.
