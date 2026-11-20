# underCtrl: развёртывание frontend на Debian 13

Инструкция для текущего React + TypeScript + Vite проекта. Исходники клонируются из Git, собираются в `dist/`, сайт раздаёт Nginx. Backend запускается отдельно и подключается через `/api/v1`.

## 1. Что установить

| Пакет / инструмент | Для чего |
| --- | --- |
| `nginx` | Раздача сайта и проксирование API |
| `git` | Получение и обновление исходников |
| `curl`, `ca-certificates` | HTTPS-загрузки и проверки |
| `xz-utils` | Распаковка официального Node.js |
| `rsync` | Копирование сборки в каталог сайта |
| `certbot`, `python3-certbot-nginx` | HTTPS-сертификат и его обновление |
| **Node.js 24 LTS** с npm | Только сборка и проверки frontend |
| **pnpm 11.25.0** | Установка зависимостей по lockfile проекта |

Команды выполняются пользователем с `sudo`:

```bash
sudo apt update
sudo apt install -y nginx git curl ca-certificates xz-utils rsync certbot python3-certbot-nginx
```

Пакет `nodejs` в штатном Debian 13 — ветка 20; у проекта в `package.json` требуется Node.js >= 24. Поэтому для сборки установите ветку 24 отдельно. `React`, `Vite` и `TypeScript` устанавливаются через pnpm, а не через apt. Python, PostgreSQL, Docker и PM2 для раздачи frontend не нужны. Если `dist/` собирает CI или другой компьютер, на веб-сервере Node.js и pnpm не требуются.

### Установка Node.js 24 и pnpm

Ниже — официальная Linux-сборка Node.js для amd64/arm64 с проверкой SHA-256, без запуска стороннего установочного скрипта. Выполняйте блок в Bash:

```bash
set -eu
case "$(dpkg --print-architecture)" in
  amd64) UNDERCTRL_ARCH=x64 ;;
  arm64) UNDERCTRL_ARCH=arm64 ;;
  *) echo 'Выберите сборку для вашей архитектуры на nodejs.org'; exit 1 ;;
esac
UNDERCTRL_TMP=$(mktemp -d)
curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$UNDERCTRL_TMP/SHASUMS256.txt"
UNDERCTRL_ARCHIVE=$(awk -v arch="$UNDERCTRL_ARCH" '$2 ~ ("-linux-" arch "\\.tar\\.xz$") {print $2}' "$UNDERCTRL_TMP/SHASUMS256.txt")
test -n "$UNDERCTRL_ARCHIVE"
curl -fsSL "https://nodejs.org/dist/latest-v24.x/$UNDERCTRL_ARCHIVE" -o "$UNDERCTRL_TMP/$UNDERCTRL_ARCHIVE"
(cd "$UNDERCTRL_TMP" && sha256sum --check --ignore-missing SHASUMS256.txt)
mkdir -p "$HOME/.local/lib/nodejs/node24" "$HOME/.local/bin"
tar -xJf "$UNDERCTRL_TMP/$UNDERCTRL_ARCHIVE" -C "$HOME/.local/lib/nodejs/node24" --strip-components=1
export PATH="$HOME/.local/lib/nodejs/node24/bin:$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/lib/nodejs/node24/bin:$HOME/.local/bin:$PATH"' >> "$HOME/.profile"
npm install --global --prefix "$HOME/.local" pnpm@11.25.0
node --version
pnpm --version
```

При повторном входе PATH подхватится из `~/.profile`. На сборочном компьютере обновляйте Node.js внутри ветки 24 и проверяйте сборку. Не устанавливайте pnpm с тегом `latest`: версия проекта закреплена в `package.json`.

## 2. Что положить в Git

Коммитятся исходники, `public/`, `scripts/`, `tests/`, `docs/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `vite.config.ts`, `tsconfig.json`, `.gitignore` и примеры env. Сохраняйте `pnpm-workspace.yaml`: в нём настройки сборки и Rollup.

Не коммитятся `node_modules/`, `dist/`, `.data/`, локальные `.env*`, ключи и сертификаты. В `data/` оставляйте только разрешённые тестовые данные. Не загружайте реальные выгрузки инцидентов в публичный репозиторий.

Если репозиторий ещё не создан, выполните в папке проекта, заменив URL на свой:

```bash
git init -b main
git add .
git status --short
git commit -m "Prepare underCtrl frontend"
git remote add origin https://github.com/ORG/underCtrl-web.git
git push -u origin main
```

## 3. Клонирование и сборка на Debian

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/ORG/underCtrl-web.git underctrl-web
cd underctrl-web
pnpm install --frozen-lockfile
cp .env.production.example .env.production
pnpm test
pnpm build
```

Настройки в `.env.production`:

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_DEMO_API=false
```

Переменные `VITE_*` встраиваются в JavaScript при сборке и доступны посетителям: секреты в них хранить нельзя. После изменения значений выполните `pnpm build` заново. `VITE_API_PROXY_TARGET` относится к локальному Vite; в production адрес backend задаётся в Nginx.

Готовый результат — папка `dist/`, включая шрифты, изображения и звук колокольчика. Сборку выполняйте с devDependencies: они нужны TypeScript и Vite. `pnpm dev`, `pnpm demo`, `pnpm start` и `vite preview` не используются как публичный production-сервер.

## 4. Размещение сборки

Каждая публикация сохраняется отдельным каталогом. Команды выполняются из корня клонированного проекта:

```bash
UNDERCTRL_RELEASE="/var/www/underctrl/releases/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 755 "$UNDERCTRL_RELEASE"
sudo rsync -a --chmod=D755,F644 dist/ "$UNDERCTRL_RELEASE/"
sudo ln -sfn "$UNDERCTRL_RELEASE" /var/www/underctrl/current.next
sudo mv -Tf /var/www/underctrl/current.next /var/www/underctrl/current
```

Nginx читает `/var/www/underctrl/current`. Каталоги со старыми релизами сохраняются для отката. Исходники, `.env`, JSON-выгрузки и SQLite в веб-каталог не копируются.

## 5. Nginx и backend API

Пример рассчитан на домен `ctrl.example.com` и **будущий backend на `127.0.0.1:8000`**. Это пример, а не существующий адрес вашего API: замените домен и порт на согласованные с backend-командой. Backend должен принимать пути `/api/v1/...`; полный контракт — [API.md](API.md).

Создайте `/etc/nginx/sites-available/underctrl`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ctrl.example.com;

    root /var/www/underctrl/current;
    index index.html;
    client_max_body_size 5m;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Живые обновления: не накапливать события в буфере.
    location = /api/v1/events/stream {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        # При задании заголовков в location повторяем весь набор.
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        gzip off;
    }

    location /api/ {
        # Без завершающего /: исходный /api/v1/... сохраняется.
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
    }

    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

Включите сайт:

```bash
sudo ln -sfn /etc/nginx/sites-available/underctrl /etc/nginx/sites-enabled/underctrl
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

`/api/` не должен попадать в SPA-fallback с `index.html`. Рекомендуется один домен для UI и API: браузер обращается к `/api/v1`, Nginx пересылает запросы backend. Так не нужен отдельный CORS для этого пути. Backend должен присылать SSE heartbeat чаще таймаута соединения; текущий клиент слушает событие `snapshot`.

Пока backend не поднят, страница откроется, но актуальные инциденты и назначения будут недоступны; запросы API получат 502. `tools/demo-api` — тестовый адаптер, не рабочий backend: у него есть изменяющие данные demo/import-роуты без авторизации, поэтому его нельзя выставлять в публичный production как есть. Вход пользователей и права доступа к реальным инцидентам ещё нужно реализовать на backend.

## 6. Домен, доступ из интернета и HTTPS

1. Нужен сервер с публичным IP. В DNS домена создайте A-запись на IPv4 сервера; AAAA добавляйте только при работающем IPv6.
2. Разрешите входящие TCP 80/443 в firewall сервера и панели хостинга. Порт SSH сохраните доступным для администрирования. Для домашнего компьютера нужен проброс портов; при CGNAT проще VPS.
3. Backend оставьте на loopback/внутренней сети. Порты Vite 5173/4173 и внутренний порт API наружу не требуются.
4. После того как домен открывает ваш Nginx по HTTP, выпустите сертификат:

```bash
sudo certbot --nginx -d ctrl.example.com --redirect
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

Для этого сценария нужен домен, указывающий на сервер, и доступный извне порт 80. Сертификат подключится к Nginx, появится перенаправление на HTTPS.

## 7. Обновление и проверка

```bash
cd ~/apps/underctrl-web
git pull --ff-only
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

Затем повторите публикацию из раздела 4. При неизменном конфиге Nginx перезапуск для обновления статических файлов не нужен.

Проверки после публикации:

```bash
curl -I https://ctrl.example.com/
curl -I https://ctrl.example.com/sounds/alert-bell.wav
curl -fsS https://ctrl.example.com/api/v1/snapshot
curl -N --max-time 20 https://ctrl.example.com/api/v1/events/stream
```

Последняя команда должна сразу показать SSE и получать события; выход curl по таймауту через 20 секунд ожидаем. Для защищённого API используйте согласованную с backend авторизацию. Проверьте в браузере обновления, открытие карточки и назначение команды. Звук разрешается после первого взаимодействия пользователя со страницей и зависит от настроек браузера/устройства.

Frontend разворачивается по этой инструкции; запуск процесса backend, его БД и авторизация описываются отдельно backend-командой. На Debian инструкция не выполнялась автоматически: локально проверяется сборка проекта.

## Официальные источники

- [Debian 13: Node.js](https://packages.debian.org/trixie/nodejs), [Nginx](https://packages.debian.org/trixie/nginx), [Certbot](https://packages.debian.org/trixie/certbot), [плагин Nginx](https://packages.debian.org/trixie/python3-certbot-nginx).
- [Официальные загрузки Node.js](https://nodejs.org/en/download), [ветка Node.js 24](https://nodejs.org/dist/latest-v24.x/).
- [Установка pnpm](https://pnpm.io/installation).
- [Vite: публикация статической сборки](https://vite.dev/guide/static-deploy.html).
- [Nginx: proxy_pass, буферизация и таймауты](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).
