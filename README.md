# underCtrl Web

React + TypeScript + Vite. Проект: `/Users/a111/Documents/work/underCtrl-web`.

В терминале VS Code: `./scripts/run.sh demo` — сайт с локальным тестовым API на http://127.0.0.1:5173/.
Для работы с отдельным backend: скопируйте `.env.example` в `.env`, настройте API и запустите `./scripts/run.sh dev`.
Проверки: `./scripts/run.sh build`, `./scripts/run.sh test`.

Главная повторяет предоставленный макет: четыре группы и общий список, серверная пагинация, постоянные сигналы в хедере со звуком и анимацией, подсветка изменений и назначение команд. Рекомендации демо работают по правилам; LLM подключается через backend. Поиск массовых проблем показывает гипотезы с основаниями.

Контракт для backend: [docs/API.md](docs/API.md).
Симуляция доступна внизу меню. Исходный снимок хранится в data/incidents.json, его изменения передаются через SSE. Локальный API tools/demo-api — тестовый адаптер с SQLite, рабочий backend разрабатывается отдельно.

Развёртывание из Git на Debian 13: [docs/DEPLOY-DEBIAN-13.md](docs/DEPLOY-DEBIAN-13.md) — пакеты, сборка, Nginx, API/SSE и HTTPS.
