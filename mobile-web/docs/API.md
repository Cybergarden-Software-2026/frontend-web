# Контракт мобильного веб-клиента

Владелец серверных маршрутов — `Cybergarden-Software-2026/backend`, рабочие ветки `feature/mobile-critical-push` и `feature/mobile-current-incidents`. Проверены `docs/mobile.md`, `crates/api/src/mobile.rs`, `fcm.rs`. Неизвестных маршрутов клиент не вызывает.

| Метод | Путь от /api/v1 | Тело | Успех |
|---|---|---|---|
| POST | /mobile/session | {code, deviceId, platform:"web"} | 201 {token,tokenType:"Bearer",deviceId,user:{login,displayName}} |
| GET | /mobile/session | — | 200 {deviceId,user} |
| GET | /mobile/incidents | — | 200 {revision,serverTime,items}, полный снимок |
| GET | /mobile/notifications?limit=100&cursor=... | — | 200 {items,nextCursor,unreadCount} |
| PUT | /mobile/notifications/{id}/read | — | 204 |
| PUT | /mobile/devices/current/token | {fcmTargetType:"token",fcmToken:FCM_REGISTRATION_TOKEN} | 204 |
| DELETE | /mobile/session | — | 204 |

Кроме обмена QR все запросы используют `Authorization: Bearer <mobile session token>`. Firebase регистрация не требуется для входа. Личный QR действует 5 минут и используется один раз. На первом запуске создаётся `crypto.randomUUID()`, сохраняемый в IndexedDB.

Запись журнала: `{id,type,title,body,createdAt,isRead,readAt}`. Все исторические записи находятся в журнале; главная использует /mobile/incidents. ID обрабатываются как непрозрачные строки (в том числе при отметке чтения), сообщения не выводятся через innerHTML.

- 401 MOBILE_PAIRING_INVALID: запросить новый QR.
- 401 MOBILE_SESSION_UNAUTHORIZED / MOBILE_DEVICE_UNAUTHORIZED: очистить локальный доступ и показать QR-вход.
- 409 MOBILE_DEVICE_IN_USE: отвязать устройство в старом аккаунте.
- 409 FCM_TOKEN_IN_USE: исправить старую серверную привязку.
- 503: backend ещё не включил мобильные аккаунты/FCM.
- 404/405: маршрут не опубликован; не подменять успешным результатом.

FCM: backend поддерживает `token` и `fid`; Firebase JS `getToken` возвращает **registration token**, поэтому используется `token`. Публичный VAPID-ключ находится в клиентской конфигурации, приватный остаётся в Firebase.

Веб-push содержит `webpush.notification` и `data`: `{type:"critical.raised",notificationId,incidentId,sysId,title,body}`. Firebase SDK показывает notification payload автоматически, поэтому background handler не создаёт второй экземпляр. Для data-only fallback используется notificationId как tag. При нажатии открывается текущая карточка по sysId; при отсутствии sysId — запись журнала. Удаление привязки останавливает новые отправки; уже принятый Firebase push может дойти после отзыва.

## Текущие инциденты

GET /mobile/incidents: реализован в backend feature/mobile-current-incidents; клиент подключён, production — после выкладки.

Ответ: {revision,serverTime,items}. Элемент: {sysId,id,header,normalizedState,priorityId,assignedGroupName,submitDate,lastAssignmentToTeamDateTime,deadline,headerKind}. sysId/id — строки. Header, команда, deadline и дата назначения nullable. Даты UTC с миллисекундами.

headerKind: critical, waiting, deadline или null. Приоритет: нерешённый P1, строго больше 8 минут у координаторов, строго меньше 20% общего срока. Research нерешённый, Resolved/Closed исключены. Некритическая просрочка с командой решения снимается. При отсутствии даты назначения используется submitDate.

Серверный headerKind используется при получении; между обновлениями правила пересчитываются по serverTime каждую секунду. Опрос 15 секунд и при возвращении в приложение/foreground push. Повторная revision не отбрасывается. Пустой успешный снимок очищает список, более старый снимок не затирает кэш. 503 SOURCE_NOT_READY означает ожидание первого импорта.
