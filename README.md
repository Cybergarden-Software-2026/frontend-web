# underCtrl Web

Дашборд ИТ-инцидентов на React, TypeScript и Vite.

Для работы с Rust API запустите Compose в репозитории backend, установите зависимости (`pnpm install --frozen-lockfile`) и выполните `pnpm dev` здесь. Откройте http://127.0.0.1:5173/. Vite передаёт запросы `/api/v1` на `127.0.0.1:8080`. Для другого порта задайте `VITE_API_PROXY_TARGET` в `.env`; например, при SSH-туннеле к порту 8001 укажите `http://127.0.0.1:8001`.
Проверки: `./scripts/run.sh build`, `./scripts/run.sh test`.

Главная повторяет предоставленный макет: четыре группы и общий список, серверная пагинация, постоянные сигналы в хедере со звуком и анимацией, подсветка изменений и назначение команд. Rust API подбирает команды по правилам на основе завершённых инцидентов. Поиск массовых проблем показывает гипотезы с основаниями.

Общий контракт API: [API.md](API.md). Дополнительные правила интерфейса: [docs/API.md](docs/API.md).
Карточки, история, назначения, статистика смены и общие массовые группы работают через Rust API. Рабочий интерфейс открывается без входа.

Для симуляции запустите [отдельный Rust-контур](API.md#demo-on-a-separate-rust-stack), затем выполните `pnpm demo`. Vite направляет демо-запросы на `127.0.0.1:18081`.

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

После push или слияния изменений в `main` таймер vserver проверяет GitHub примерно раз в минуту. Git использует настроенный deploy key пользователя `cyber`. Docker собирает и тестирует конкретный коммит `main`. Перед заменой контейнера скрипт проверяет HTML, JS, звук и API на временном локальном порту. Python 3 разбирает ответ о режиме входа. В открытом режиме скрипт проверяет JSON-снимок и первое событие SSE. Когда вход обязателен, скрипт проверяет, что оба маршрута возвращают анонимному клиенту `401 COORDINATOR_UNAUTHORIZED`. Рабочий контейнер доступен на `127.0.0.1:8005`. При сбое после переключения скрипт возвращает предыдущий контейнер. На время замены возможна короткая пауза.

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

Сначала выпустите backend с миграцией PostgreSQL. После проверки `/api/v1/statistics/shift` и `/api/v1/problems/clusters` обновите frontend. Существующий прокси `/api/` обслуживает оба новых маршрута.

Проверки GitHub Actions запускаются для push и pull request в `main`.

## Мобильное веб-приложение

Отдельная PWA находится в `mobile-web/` и публикуется по **`/mobile/`** в том же Docker-образе. У неё свои зависимости, сборка, manifest и service worker со scope `/mobile/`; существующий `/api` проксирует мобильный Bearer в Rust API.

Для входа откройте `/mobile/` на телефоне и отсканируйте QR-код под основным меню кабинета координатора. На iPhone сначала добавьте PWA на экран «Домой» через Safari и откройте её с иконки, затем нажмите на колокольчик в правом верхнем углу.

Нажатие на QR увеличивает его. Кнопка **«Код для ручного входа»** под QR открывает тот же одноразовый код в текстовом поле с копированием. В мобильном приложении его можно вставить через **«Ввести код вручную»**, в том числе прямо из сканера. Код действует пять минут; после истечения получите новый в кабинете.

На iPhone и Android кнопка «Сканировать QR-код» открывает живой видоискатель и распознаёт QR автоматически. Если видео не запускается, можно перезапустить просмотр или считать QR со снимка.

Docker и CI устанавливают зависимости, запускают тесты и собирают оба приложения. Изменения в `main` публикуются существующим таймером vserver. Дополнительный сервис или внешний адрес API не нужны. Фоновые push текущего backend отправляются только для `critical.raised`; остальные две категории хедера видны внутри приложения.

Локальная работа: `cd mobile-web && pnpm install --frozen-lockfile && pnpm dev`. Проверки: `pnpm test`, `APP_BASE_PATH=/mobile/ pnpm build`. [Контракт и устройство PWA](mobile-web/README.md).
