# underCtrl Web

React + TypeScript + Vite. Проект: `/Users/a111/Documents/work/underCtrl-web`.

В терминале VS Code: `./scripts/run.sh demo` — сайт с локальным тестовым API на http://127.0.0.1:5173/.
Для работы с отдельным backend: скопируйте `.env.example` в `.env`, настройте API и запустите `./scripts/run.sh dev`.
Проверки: `./scripts/run.sh build`, `./scripts/run.sh test`.

Главная повторяет предоставленный макет: четыре группы и общий список, серверная пагинация, постоянные сигналы в хедере со звуком и анимацией, подсветка изменений и назначение команд. Рекомендации демо работают по правилам; LLM подключается через backend. Поиск массовых проблем показывает гипотезы с основаниями.

Контракт для backend: [docs/API.md](docs/API.md).
Симуляция доступна внизу меню. Исходный снимок хранится в data/incidents.json, его изменения передаются через SSE. Локальный API tools/demo-api — тестовый адаптер с SQLite, рабочий backend разрабатывается отдельно.

Развёртывание из Git на Debian 13: [docs/DEPLOY-DEBIAN-13.md](docs/DEPLOY-DEBIAN-13.md) — пакеты, сборка, Nginx, API/SSE и HTTPS.

## Ручной запуск в Docker на vserver

Из корня репозитория выполните:

```bash
sudo docker build --pull -t underctrl-frontend:manual .
sudo docker run -d --name underctrl-frontend-manual --restart unless-stopped \
  -p 127.0.0.1:8005:8080 underctrl-frontend:manual
curl --noproxy '*' -fsS http://127.0.0.1:8005/healthz
curl --noproxy '*' -fsSI http://127.0.0.1:8005/
```

Сборка запускает тесты и проверку TypeScript. На хосте контейнер доступен по
`127.0.0.1:8005`. `/healthz` возвращает `ok`. При отдельном запуске фронтенда
`/api/` отвечает JSON с кодом `503`. Для подключения бэкенда хостовый Nginx
должен направить `/api/` на API и передать исходный путь запроса.
