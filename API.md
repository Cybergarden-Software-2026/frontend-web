# underCtrl incident dashboard HTTP API

Contract for the Rust API used by the web dashboard. [Frontend client](https://github.com/Cybergarden-Software-2026/frontend-web/blob/main/src/data/api.ts) · [OpenAPI schema](https://github.com/Cybergarden-Software-2026/backend/blob/main/crates/api/static/openapi.json)

## Implementation status

Status reflects the committed implementation in the owning repository. Production availability also depends on deployment and configuration. Paths in this table start at the host root.

| Capability | Owning repository | Status |
|---|---|---|
| `GET/POST/DELETE /api/v1/auth/coordinator/session` and protected dashboard routes | `backend` and `frontend-web` | Implemented (enabled by configuration) |
| Personal coordinator accounts with password and individual key, plus assignment attribution | `backend` and `frontend-web` | Implemented (enabled by `COORDINATOR_ACCOUNTS_ENABLED`) |
| Personal QR sign-in on mobile, account notifications, device token rotation and Firebase delivery for `critical.raised` | `backend` and `frontend-web` | Implemented (enabled per deployment) |
| Separate QR-authenticated mobile PWA at `/mobile/`, account-bound offline cache and FCM registration | `frontend-web` | Implemented |
| Current incidents and the three dashboard header conditions via `GET /api/v1/mobile/incidents` | `backend` | Implemented (personal mobile session) |
| Team phone numbers in `GET /api/v1/teams` and `GET /api/v1/mobile/incidents` | `backend` | Implemented |
| `POST /api/v1/mobile/incidents/{sysId}/team-contact` and `team_contacted` event projection | `backend` | Implemented (personal mobile session) |
| Team phone display, mobile call action with contact recording and web journal label | `frontend-web` | Implemented |
| `GET /api/v1/snapshot` and `GET /api/v1/dashboard` | `backend` | Implemented |
| `GET /api/v1/incidents` with page and cursor pagination, and `GET /api/v1/incidents/{key}?view=web` | `backend` | Implemented |
| `GET /api/v1/teams` and rules-based `GET /api/v1/incidents/{key}/analysis` | `backend` | Implemented |
| LLM summary and team suggestion in `GET /api/v1/incidents/{key}/analysis` (`provider: "llm"`, background `ai-worker`, `LLM_ENABLED`) | `backend` | Implemented (verified with a mock model; enabled per deployment) |
| `POST /api/v1/incidents/{sysId}/assignment` with revision checking | `backend` and `frontend-web` | Implemented |
| `GET /api/v1/events`, `GET /api/v1/events/stream`, and `GET /api/v1/incidents/{key}/events` | `backend` | Implemented |
| `GET /api/v1/notifications` and `PUT /api/v1/notifications/{notification_id}/read` | `backend` | Implemented |
| `GET /api/v1/openapi.json`, `GET /api/docs`, `GET /redoc`, and `GET /docs/oauth2-redirect` | `backend` | Implemented |
| `GET /health` and `GET /health/ready` | `backend` | Implemented |
| Shift assignments, coordination KPI and intervals between team assignments via `GET /api/v1/statistics/shift`, scoped to the signed-in coordinator in accounts mode | `backend` | Implemented |
| Separate chart for the time between team assignments | `frontend-web` | Implemented |
| Shared mass-problem membership and exclusions via `GET/PATCH /api/v1/problems/clusters` | `backend` | Implemented |
| LLM review of automatic mass-problem groups (title and reason in `GET/PATCH /api/v1/problems/clusters`) | `backend` | Implemented (verified with a mock model; enabled per deployment) |
| Shift PDF/Excel export and sequential group assignment | `frontend-web` | Implemented |
| Atomic bulk team assignment | `backend` | Not implemented |
| Same-origin `/api` proxy and `GET /healthz` | `frontend-web` | Implemented |
| `POST /api/v1/demo` and `PUT /api/v1/incidents` | `backend` | Implemented (isolated demo only) |

## Connecting

In the browser, use `/api/v1` on the same origin as the frontend. The read and subscription examples use `curl` and `jq` on vserver and reach the API through the frontend Nginx proxy. Replace the example `SYS_ID` with a string ID from your test snapshot.

```bash
API='http://127.0.0.1:8005/api/v1'
SYS_ID='123456789012345678'
curl -fsS "$API/snapshot?view=web" | jq '{revision, source: .source.status, incidents: (.items | length)}'
```

For a standard local Docker Compose deployment, the backend base URL is `http://127.0.0.1:8080/api/v1`. For remote access, use the site's HTTPS URL followed by `/api/v1`.

| Operation | Method and path relative to `/api/v1` | Result |
|---|---|---|
| Load the dashboard | `GET /snapshot?view=web` | Full snapshot at the current revision |
| Load the queue | `GET /incidents?page=1&pageSize=9` | Page of incidents, record count, and page count |
| Receive updates | `GET /events/stream?view=web` | SSE stream of full snapshots |
| List available teams | `GET /teams` | Team names, phone numbers and active assignment counts |
| View analysis | `GET /incidents/{key}/analysis` | Incident brief, facts, items requiring attention, and candidate teams |
| Assign a team | `POST /incidents/{sysId}/assignment` | Full snapshot after the operation |

The command examples below use a local instance without authentication. When coordinator access is configured, call protected routes with the coordinator session cookie over HTTPS.

### Coordinator access

With `COORDINATOR_ACCOUNTS_ENABLED=true`, the Rust API requires an active coordinator account. The administrator provisions accounts on the backend. Each account has a login, password and separate key. The frontend shows both sign-in methods. The backend verifies credentials and stores only password verifiers and key digests. There is no public registration endpoint.

| Method on `/api/v1/auth/coordinator/session` | Request and response |
|---|---|
| `GET` | Returns `200` with `required` and `authenticated`. In accounts mode it includes `mode: "accounts"`. An authenticated account response includes `coordinator: { "login": "test-coordinator-1", "displayName": "Тестовый координатор 1" }`. |
| `POST` | Accepts one of `{ "login": "test-coordinator-1", "password": "<password>", "remember": false }` or `{ "key": "<personal key>", "remember": false }`. Returns the authenticated session status and sets a cookie. Invalid credentials or a disabled account return `401`. |
| `DELETE` | Invalidates the current session, clears the cookie and returns `204`. |

Accounts mode requires a session even when no accounts have been created. It accepts only personal credentials and account sessions. With accounts mode disabled, the legacy `COORDINATOR_ACCESS_KEY` setting can still require shared-key authentication. If neither mode is configured, `GET` and `POST` return `200` with `required: false` and `authenticated: false`, and dashboard routes are open during rollout. `DELETE` returns `204` in each mode.

The API issues a host-only `__Host-underctrl-coordinator` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/`. The default session expires after 12 hours on the server and uses a browser session cookie. Selecting **Remember this device** issues a cookie and session valid for seven days. The browser sends the cookie on normal same-origin requests, including SSE. For cross-origin requests within the same site, add the HTTPS frontend origin to `CORS_ORIGINS` and send credentials on both `fetch` and `EventSource`.

The API returns `401` for protected routes without a valid session and `403` for writes from a disallowed browser origin. Protection covers dashboard data, the queue, incident details and history, the team directory, analysis, notifications, statistics, SSE, team assignments and group edits. Authenticated data and session responses specify `Cache-Control: no-store`. The server rechecks access before sending each SSE update or heartbeat, so disabling an account also stops access through its open streams. Health and API documentation are available without a session.

### Mobile QR sign-in and critical alerts

The signed-in web dashboard issues a five-minute, one-use code and encodes its exact string in the QR. After scanning, the client sends the code and its own persistent installation ID (`deviceId`, 1–128 visible ASCII characters). The server determines the account from the QR and returns a revocable mobile session. A randomly generated installation UUID is suitable. Personal accounts must be enabled. FCM registration can follow sign-in and is optional for account access.

| Method and path under `/api/v1` | Authentication / request | Response |
|---|---|---|
| `POST /mobile/pairings` | Personal coordinator cookie | `201 {code,expiresAt}` |
| `POST /mobile/session` | JSON `{code,deviceId,platform?}` (`android` by default, or `web`) | `201 {token,tokenType:"Bearer",deviceId,user:{login,displayName}}` |
| `GET /mobile/session` | Mobile session Bearer | `200 {deviceId,user:{login,displayName}}` |
| `GET /mobile/incidents` | Mobile session Bearer | `200 {revision,serverTime,items}` with current incidents, team and phone, UTC dates, priority, state and `headerKind` |
| `POST /mobile/incidents/{sysId}/team-contact` | Mobile session Bearer, JSON `{team,requestId}` | `201` with the journal event, or `200` with the same event on retry |
| `GET /mobile/notifications` | Mobile session Bearer, optional `limit` and `cursor` | `200 {items,nextCursor,unreadCount}`, same notification schema and per-account read state as the dashboard |
| `PUT /mobile/notifications/{notification_id}/read` | Mobile session Bearer, empty body | `204` |
| `PUT /mobile/devices/current/token` | Mobile session or push-only Bearer, JSON `{fcmToken,fcmTargetType?}` | `204` after registering or rotating the Firebase target |
| `DELETE /mobile/session` | Mobile session Bearer | `204` after signing out, unbinding push and revoking this token |
| `GET /mobile/devices` | Personal coordinator cookie | `200 {items:[{deviceId,platform,createdAt,pushEnabled}]}`; here `deviceId` is the server registration UUID for owner revocation |
| `DELETE /mobile/devices/{deviceId}` | Owning coordinator cookie, registration UUID from the list | `204` |
| `POST /mobile/devices` | Legacy push-only exchange, JSON `{code,platform,fcmToken,fcmTargetType?}` | `201 {deviceId,deviceToken}` |
| `DELETE /mobile/devices/current` | Mobile session or push-only Bearer | `204` after unlinking |

Mobile sessions have no fixed expiry. A fresh QR login for the same account and installation rotates its bearer. Logout, owner revocation, or disabling the account invalidates it. Another account attempting to claim the installation receives `409 MOBILE_DEVICE_IN_USE` and keeps its QR usable. A used, expired or replaced code yields `401 MOBILE_PAIRING_INVALID`. An invalid session bearer yields `401 MOBILE_SESSION_UNAUTHORIZED` on the account endpoints. Use `fcmTargetType:"fid"` for a registered Firebase installation ID or `"token"` for a registration token (default). Firebase push requires `MOBILE_PUSH_ENABLED=true`. Examples and recovery steps are in the [mobile integration guide](https://github.com/Cybergarden-Software-2026/backend/blob/main/docs/mobile.md).

To display header cards, select items with a non-null `headerKind`. Values are `critical`, `waiting` and `deadline`, in order of precedence when a ticket matches multiple conditions. Each item has `sysId`, `id`, `header`, `normalizedState`, `priorityId`, `assignedGroupName`, `submitDate`, `lastAssignmentToTeamDateTime`, `deadline` and `headerKind`. All items come from one snapshot revision. The server evaluates them at `serverTime` on each request, so a time threshold can change the cards within the same revision. Before the first successful import this route returns `503 SOURCE_NOT_READY`. After a successful empty import it returns `200` with `items: []`.

Each mobile incident also has `teamPhone` and `teamPhoneIsTest`. For a resolution team with an international-format number and `teamPhoneIsTest: false`, tapping «Связаться с командой» starts a keepalive request and opens the system dialer with that number. For a test or missing number, «Отметить контакт» records contact made through another channel. The request sends the displayed `assignedGroupName` as `team` and a UUID `requestId`. The event records the action at tap time. After a network failure, «Повторить запись» sends the same UUID without opening the dialer again. The backend validates the assignment and records the authenticated coordinator and server time. See the [team contact examples and errors](https://github.com/Cybergarden-Software-2026/backend/blob/main/docs/mobile.md#связь-с-командой).

## 1. Get a snapshot and find incident identifiers

`GET /snapshot?view=web` returns JSON. The first successful import makes the snapshot available. If the source later stops updating, the API continues serving the most recent accepted snapshot with information about the source's condition.

| Field | Type and meaning |
|---|---|
| `revision` | Integer. Revision of the **entire snapshot**. Pass it as `expectedRevision` when assigning a team. |
| `eventCursor` | String representation of `revision`. Used to subscribe in `notify` mode. |
| `serverTime`, `updatedAt` | UTC timestamp when the server produced the response and timestamp of the most recent data change, respectively. |
| `items` | Array of all incidents currently present. `sysId` and the `INC…` ticket number in `id` are strings. Keep `sysId` as a string in JavaScript as well. |
| `events` | Up to the 200 most recent events, newest first. The initial archive import produces an empty history. |
| `source` | `path`, `status` (`initializing`, `ok`, `error`), `readAt`, `lastSuccessfulImportAt`, `lastCheckedAt`, `errorSince`, `incidentCount`, `warnings`, `error`. If the source reports an error, check `source.error`. |
| `groups` | Dashboard groups. Each has `key`, `title`, `incidentIds`, `sysIds`, and `count`. One incident can belong to multiple groups. |
| `itsmUrlTemplate` | ITSM link template or `null`. |

Each incident includes source fields such as `header`, `stateEnum`, `priorityId`, `service`, and `assignedGroupName`. Optional source fields can be absent or `null`. The `dashboard` object adds the incident revision `incidentRevision`, the normalized state, groups, SLA information, and an `itsmUrl` link. In the web view, `dashboard.sourceDates` contains dates that the importer has already converted to UTC. Paginated queue results, successful assignment responses, and `GET /incidents/{key}?view=web` include this object as well.

The following command selects fields from a record. The sample result uses synthetic data.

```bash
curl -fsS "$API/snapshot?view=web" | jq --arg id "$SYS_ID" \
  '.items[] | select(.sysId == $id) | {sysId, id, header, stateEnum, priorityId, dates: .dashboard.sourceDates}'
```

```json
{
  "sysId": "123456789012345678",
  "id": "INC000000000001",
  "header": "Scanner camera is unavailable",
  "stateEnum": "Assigned",
  "priorityId": 1,
  "dates": {
    "submitDate": "2026-01-10T09:00:00Z",
    "deadline": "2026-01-10T17:00:00Z",
    "completionDate": null,
    "lastAssignmentToTeamDateTime": "2026-01-10T09:00:00Z"
  }
}
```

## 2. Filter the queue

Pass `page` explicitly. `GET /incidents` also has a cursor mode with a different response format. The server applies all web queue filters together before pagination.

| Parameter | Values and behavior |
|---|---|
| `page`, `pageSize` | Pages start at 1. Page size is 1–100 and defaults to 9. Requests past the end return the last page. |
| `group` | Defaults to `all`. Also accepts `critical`, `high`, `coordinators`, `research`, `resolved`, and `closed`. |
| `q` | Up to 200 characters. Case-insensitive substring search over ticket number `id`, title, description, product, service, and team. |
| `team` | Exact team name from the directory, up to 200 characters. `__unassigned__` selects records without a team. |
| `priority` | Integer 1–4. A value of 4 is the highest priority and appears as P1 in the UI. |
| `status` | `Assigned`, `WorkInProgress`, `Research`, `Resolved`, `Closed`, or `Unknown`. |
| `sla` | For active work, `late` means the deadline is at or before the current time, `soon` means up to 30 minutes remain, inclusive, and `normal` means more time remains. `research`, `restored`, and `closed` correspond to incident states. `unknown` means an active incident has no deadline or the state is unknown. |
| `sort` | Defaults to `priority`. Also accepts `deadline` and `newest`. The first two put incidents that require attention first. Within that set, `priority` sorts from highest to lowest priority, then by earliest deadline. `deadline` sorts from earliest to latest deadline, with missing deadlines last. `newest` sorts by submission date, newest first. |

Frontend display: a `Research` incident with a valid `deadline` shows a live countdown, including an overdue value. This does not change the backend `sla=research` classification or its filter semantics. `Resolved` and `Closed` show `00:00:00` with a stopped label, retaining the original deadline as a planned date. A missing deadline shows `--:--:--`. No backend route or schema change is required.

In the web queue, `critical` and `high` select priorities 4 and 3 respectively, in state `Assigned` or `WorkInProgress`. The `coordinators` group also includes incidents in `Research` assigned to the configured coordinator team. Use the queue response's `total` to get the count for a particular filter. The aggregate `snapshot.groups` also applies the server's display rules for recently resolved cases.

```bash
curl -fsSG "$API/incidents" \
  --data-urlencode 'page=1' --data-urlencode 'pageSize=9' \
  --data-urlencode 'group=coordinators' --data-urlencode 'sort=deadline' \
  | jq '{page, pageSize, total, totalPages, revision, ids: [.items[].id]}'
```

The full response contains `items`, `total`, `page`, `pageSize`, `totalPages`, and `revision`. An empty result still has one page.

```json
{"items":[],"total":0,"page":1,"pageSize":9,"totalPages":1,"revision":12}
```

## 3. Choose and assign a team

**Directory.** `GET /teams` returns `{"items":[{"name":"Team A","activeCount":3,"phone":"+78193897280","phoneIsTest":true}],"revision":12}`. The directory includes teams with no active assignments. `activeCount` counts currently present incidents assigned to the team, excluding resolved and closed incidents. Copy the exact `name` when assigning a team. The backend generates a stable example number for a team without a configured phone. The interface labels that number as test data. A configured phone has `phoneIsTest: false`.

**Analysis.** `GET /incidents/{key}/analysis` accepts the `sysId` or ticket number `id` of an incident that is still present. The response contains `sysId`, `revision`, `generatedAt`, `provider` (`rules` or `llm`, see below), `summary`, `facts` (pairs of `label` and `value`), `attention`, `missing`, and `candidates`. The Russian `summary` is a short brief of the problem, recorded actions and latest known outcome. Resolution notes may describe an earlier attempt, so the current status and any reopening qualify the outcome. Each candidate has `team`, `evidenceIds`, and `reason`. The algorithm suggests up to three directory teams based on completed cases that have a completion date and match either the service or the combination of scenario and product. For incidents awaiting routing by coordinators, when no such completed case matches, the algorithm checks incidents with the same criteria in `WorkInProgress` or `Research`. `evidenceIds` contains `INC…` ticket numbers and `reason` explains the source of the evidence. The candidate array is empty when there is insufficient evidence.

**LLM analysis.** With `LLM_ENABLED`, a background `ai-worker` prepares the brief from the incident description, current status, team, resolution fields and up to five recent changes to its status, team or solution. A relevant update, such as an edited solution, a team transfer or a reopening, invalidates the old brief. Unrelated changes to other incidents do not. The request returns immediately with the rules-based brief when a new result is pending or the model is unavailable. Optional `summaryPending: true` indicates that a job for the current brief is queued or running. Other responses may omit the flag. A ready model brief uses the generation time for `generatedAt`.

Team selection uses the existing evidence checks. With `provider: "llm"`, the response has at most one team, selected from the offered candidates and still supported by the current evidence and directory. If the model abstains but the incident awaits coordinator routing and supported candidates remain, the response retains those candidates, `provider: "rules"` and the model brief prefixed with `Разбор ИИ.`. Other model responses without a valid choice have `candidates: []`. Assignment is a separate coordinator action.

**Incident detail.** The web card’s “Помощь ИИ” dialog shows the brief. It can use the displayed card and available events while loading, offline or on an archived card. A matching server brief replaces it. While an open, online card has `summaryPending: true`, the client checks again with bounded backoff. Closing the dialog cancels the checks. The standalone demo API produces a rules-based brief.

```bash
curl -fsS "$API/teams" | jq '.items[] | {name, activeCount, phone, phoneIsTest}'
curl -fsS "$API/incidents/$SYS_ID/analysis" | jq '{summary, attention, candidates, missing}'
```

**Assignment.** `POST /incidents/{sysId}/assignment` requires the incident's `sysId`. The JSON body contains the chosen team name and the snapshot revision the coordinator saw. Send the coordinator session cookie if authentication is enabled. In accounts mode the assignment event records the authenticated login as the actor.

```json
{"team":"Storage Operations","expectedRevision":12}
```

Run this example on the workstation hosting a disposable Rust API. Use the direct backend address and replace `TEST_SYS_ID` and the sample team with values from the test API. The following commands fetch the snapshot, display the current assignment, and save the revision. The POST request assigns the selected team.

```bash
ASSIGNMENT_API='http://127.0.0.1:8080/api/v1'
TEST_SYS_ID='123456789012345678'
snapshot=$(curl -fsS "$ASSIGNMENT_API/snapshot?view=web")
printf '%s' "$snapshot" | jq --arg id "$TEST_SYS_ID" '.items[] | select(.sysId == $id) | {id, header, assignedGroupName}'
revision=$(printf '%s' "$snapshot" | jq -er '.revision')
team='Storage Operations'
curl -sS -i "$ASSIGNMENT_API/incidents/$TEST_SYS_ID/assignment" \
  -H 'Content-Type: application/json' \
  --data-binary "$(jq -nc --arg team "$team" --argjson rev "$revision" '{team:$team,expectedRevision:$rev}')"
```

On `200`, the client receives the full web snapshot. Changing the team clears the previous individual assignee, updates the assignment timestamp, and publishes the change through SSE. The incident's state stays the same. Selecting the current team again with a current revision returns a snapshot at the same revision. The assignment persists in PostgreSQL across re-imports of the old export. A change to the assignment fields in ITSM, closure or resolution of the incident, or removal of the incident from the export returns control to the source.

On `409` with `currentRevision`, fetch the snapshot again, display the current team, and ask the coordinator to confirm the choice again. The API returns a separate `409` for incidents in `Resolved` or `Closed` state.

### Mass-problem workspace

`GET /api/v1/problems/clusters` returns `{revision, items, exclusions}`. Each group in `items` has `id`, `title`, `reason`, `sysIds` and `incidentIds`. Candidates are inferred from registration within 24 hours plus one of: the same service, similar header symptoms, or the same product and usage scenario with a similar problem description (header, short and full description). The same product alone is never enough. With `LLM_ENABLED`, `ai-worker` also asks the local model whether each automatic group describes one problem. A confirmed group gets the model's Russian `title`, and `reason` gets the suffix `. ИИ: <summary>`; an unconfirmed group keeps its rules title and gets `. ИИ не подтвердил общую проблему: <summary>`. The review never changes `id`, membership or exclusions, and it is ignored once any member's header, descriptions, product, service, scenario or the group's membership changes. Manual groups keep the title and reason they had when created. Manual membership and exclusions are shared in PostgreSQL. Exclusion records include `sysId`, `incidentId`, `header`, `groupTitle`, `contextKey`, and `excludedAt` (Unix milliseconds). A service, title or registration-time change sends the affected incident back through automatic grouping.

Send one operation to `PATCH /api/v1/problems/clusters` using the current `revision` from GET as `expectedRevision`:

```json
{"expectedRevision":12,"action":"add","groupId":"service:example","sysIds":["123456789012345678"]}
```

```json
{"expectedRevision":12,"action":"exclude","groupId":"service:example","sysId":"123456789012345678"}
```

```json
{"expectedRevision":12,"action":"restore","sysId":"123456789012345678"}
```

Each example represents an independent request at revision 12. Use a real group ID and member IDs from GET. The response contains the updated workspace. On `409`, reload the workspace and review the change before resubmitting. Saved edits increase the dashboard revision and other clients refresh on SSE. Exclusion affects grouping while the incident remains in the general queue.

Group assignment calls `POST /incidents/{sysId}/assignment` sequentially for the reviewed list. Each request carries the latest confirmed revision. Confirmed assignments persist if a later member fails or the operator stops.

## 4. Receive real-time changes

`GET /events/stream?view=web` opens a `text/event-stream` response. After the first import, the server sends a `snapshot` event as soon as a client connects and again whenever the revision changes. The `data` field contains the full JSON in the same format as `GET /snapshot?view=web`. The SSE `id` is the `revision`. The client can replace its previous state in full even if it missed intermediate revisions.

```bash
curl -NsS --max-time 5 "$API/events/stream?view=web"
```

The first SSE control block contains `retry: 2000`. A five-second timeout is expected while the stream remains open. By default, if nothing changes, the server sends a `: heartbeat` comment every 15 seconds. Before the first import, the connection may already have status `200` and be waiting for its first snapshot. Reconnecting returns the current snapshot. Its `serverTime` may reflect when that revision was built. Fetch a fresh REST snapshot to synchronize the clock.

Use the browser’s EventSource API to subscribe.

```javascript
const stream = new EventSource('/api/v1/events/stream?view=web');
stream.addEventListener('snapshot', event => {
  const snapshot = JSON.parse(event.data);
  console.log(snapshot.revision, snapshot.items.length);
});
// Call stream.close() when leaving the screen.
```

Clients that only need a change signal can use `GET /events/stream?mode=notify&since=12`. Get the initial cursor from `snapshot.eventCursor`. On reconnect, a nonempty `Last-Event-ID` takes precedence over `since`. Without a cursor, the server waits for the next change. If several new revisions are available, it may emit one signal for the newest revision.

```text
id: 13
event: dashboard.changed
data: {"schemaVersion":1,"reason":"assignment"}

```

Change reasons are `import`, `source`, `expiry`, `assignment`, and `mass_problems`. On `stream.reset`, the server sends `schemaVersion`, `reason`, and the current `eventCursor`, then closes the stream. Reset reasons are `invalid_cursor`, `cursor_ahead`, and `cursor_expired`. The client should close its old subscription, fetch a new snapshot, and open a stream using the returned cursor. Both `since` and `Last-Event-ID` are limited to 32 characters.

## 5. Incident details, history, and notifications

| Route | Parameters and response |
|---|---|
| `GET /dashboard` | Compact summary with `eventCursor`, `serverTime`, `source`, `groups`, and `incidents`. The `incidents` object is keyed by ticket number `id`. |
| `GET /incidents/{key}` | Incident details by `sysId` or ticket number `id`. The response contains `incident`, `revision`, `normalizedState`, and `details`. Use `details.isPresent` to check whether the record is still in the export. |
| `GET /events` | Global event history. Filters are `afterId`, `beforeId`, `type`, `incidentSysId` (up to 64 characters), and `limit`. Returns `items` and `nextCursor`. To get JSON, omit `since` and use a standard `Accept` header. Passing `since` or `Accept: text/event-stream` selects SSE `notify` mode on this route. |
| `GET /incidents/{key}/events` | History for one incident. Parameters are `beforeId` and `limit`. Returns `items` and `nextCursor`. |
| `GET /notifications` | Parameters are `cursor` and `limit`. Returns `items`, `nextCursor`, and `unreadCount`. Each notification has `id`, `type`, `title`, `body`, `isRead`, `readAt`, and references to the related incident or event when available. |
| `PUT /notifications/{notification_id}/read` | Takes a positive numeric notification ID. Send an empty body. The successful response is `204 No Content`. Marking an already-read notification yields the same response. |

The `frontend-web` event journal uses the cursor-based `GET /events` archive together with recent SSE events, deduplicated by `eventId`. Its search, event-type and time-period filters are applied before eight-row display pagination.

History and notification lists return records newest first. `limit` defaults to 50 and accepts 1–200. In history requests, `afterId` and `beforeId` are exclusive bounds on **eventId**. To fetch older events, send `nextCursor` as `beforeId`. For notifications, send it as `cursor`. A cursor of `null` ends pagination. These cursors contain up to 18 decimal digits.

A history event contains `eventId`, `revision`, `incidentRevision`, `sysId`, `incidentId`, `header`, `at`, the arrays `types` and `fields`, and the source records `previous` and `current`, each of which may be `null`. One event can have multiple types. The `type` filter accepts one of `created`, `critical`, `assigned`, `team_contacted`, `resolved`, `closed`, `reopened`, `research`, `deadline`, `team`, `priority`, `changed`, or `removed`. SSE subscription cursors track snapshot revisions. History cursors track individual events.

A confirmed contact has `types: ["team_contacted"]`, `contact: {team, actorLogin, actorDisplayName, requestId}`, `fields: []`, `previous: null` and `current: null`. The journal and incident history display the recorded team and actor using the «Связались с командой» label. The same event is available in SSE snapshots. The action records history independently of Firebase notification delivery.

In accounts mode the authenticated login determines notification read state. In the open and legacy shared-key modes both notification routes accept `X-User-Id`. It allows 1–64 characters from `A–Z`, `a–z`, `0–9`, `_`, `.`, `@`, and `-`. If omitted, the server uses `DEFAULT_USER_ID`, typically `coordinator`.

```bash
curl -fsSG "$API/events" --data-urlencode "incidentSysId=$SYS_ID" --data-urlencode 'limit=10'
curl -fsS "$API/notifications?limit=5" -H 'X-User-Id: shift-a'
```

### Cursor-based incident pagination

Start with `GET /incidents?limit=100`. The response has `items`, `revision`, and `nextCursor`. Send the opaque `nextCursor` back as `cursor` and keep the other filters unchanged. The server returns `nextCursor: null` at the end. If the data changes between pages, the server returns `409 CURSOR_EXPIRED`. Restart from the first page.

| Parameter | Cursor mode contract |
|---|---|
| `limit`, `cursor` | 1–500 records, default 100. The initial request can omit the cursor. |
| `q`, `team` | Search text and assigned team, up to 200 characters each. |
| `group`, `state`, `priorityId` | Group `critical`, `coordinators`, `high`, or `research`. State from the normalized-state enumeration. Priority 1–4. |
| `sort` | Defaults to `deadline`. Also accepts `-deadline`, `submitDate`, `-submitDate`, `priority`, `-priority`, and `id`. In this mode, `priority` sorts from highest to lowest. |

The parameters `page`, `pageSize`, `priority`, `status`, and `sla` select web queue mode. So do `group=all|resolved|closed`, `sort=newest`, and `team=__unassigned__`. Combining any of these with `limit` or `cursor` returns `400`.

## 6. Errors and diagnostics

Use the HTTP status and the `code` field to handle API errors. The user-facing text is in `message` and is duplicated in `error`. The response header `X-Request-ID` and field `requestId` identify the request in the logs. This example illustrates the response for a stale assignment revision. The message is shown in English for illustration.

```json
{
  "error": "The data changed. Check the current team and try assigning again.",
  "code": "CONFLICT",
  "message": "The data changed. Check the current team and try assigning again.",
  "requestId": "example-request-42",
  "currentRevision": 13
}
```

| HTTP | `code` | What to check |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST` | Filter values, incompatible pagination modes, JSON format, the type of `expectedRevision`, or the exact team name. Parameter errors may include an `errors` array. |
| 400 | `INVALID_CURSOR`, `INVALID_SORT`, `INVALID_USER` | Cursor, sort order in cursor mode, or the value of `X-User-Id`. |
| 404 | `INCIDENT_NOT_FOUND`, `MASS_PROBLEM_NOT_FOUND`, `NOTIFICATION_NOT_FOUND`, `NOT_FOUND` | Resource identifier or path. Assignment requires the `sysId`. |
| 405 | `METHOD_NOT_ALLOWED` | HTTP method for the route. |
| 409 | `CONFLICT`, `CURSOR_EXPIRED` | Assignment or workspace revision, incident state, or queue cursor. |
| 503 | `SOURCE_NOT_READY` | The importer has yet to accept its first valid export. Check `/snapshot` and the importer's status. |
| 500 | `INTERNAL_ERROR` | Find the request in the server log using `requestId`. |

### Service endpoints

The paths in this table are relative to the **host root**.

| Path | Response and where to call it |
|---|---|
| `GET /api/v1/openapi.json` | OpenAPI 3.1 schema with request and response models. Available through the frontend proxy. |
| `GET /api/docs` | Swagger UI. Available through the frontend proxy. |
| `GET /redoc` | ReDoc at the direct backend address. The Swagger support route is `GET /docs/oauth2-redirect`. |
| `GET /health` | Call the backend directly. A running process returns `200 {"status":"ok"}`. |
| `GET /health/ready` | Call the backend directly. If the database is available, returns `200 {"status":"ok","database":true}`. Otherwise returns `503 {"status":"unavailable","database":false}`. Check the first import separately via `/api/v1/snapshot`. |
| `GET /healthz` | Frontend Nginx route. Returns `200` and the text `ok`. |

```bash
curl -fsS http://127.0.0.1:8001/health/ready
curl -fsS http://127.0.0.1:8005/healthz
curl -fsS "$API/openapi.json" | jq '.info'
```

### Demo on a separate Rust stack

`POST /api/v1/demo` accepts `{"action":"resolve"}` (other actions include `reopen`, `research`, `close` and `reset`). `PUT /api/v1/incidents` replaces the entire test snapshot with the supplied JSON array. Rust validates the change, replaces the test export atomically, imports it into PostgreSQL and returns the web snapshot. Both routes require `DEMO_API_ENABLED=true` and a writable export directory. Reset reads `DEMO_SEED_PATH`. With demo off, simulation returns `404` and JSON replacement returns `405`.

To run it from the backend checkout with an existing `.env`, create a separate demo export and a separate Compose project:

```bash
export UNDERCTRL_DEMO_DATA_DIR="$(mktemp -d /tmp/underctrl-demo.XXXXXX)"
cp testdata/character_problems.json "$UNDERCTRL_DEMO_DATA_DIR/character_problems.json"
cp testdata/character_problems.json "$UNDERCTRL_DEMO_DATA_DIR/seed.json"
sudo chown -R 65532:65532 "$UNDERCTRL_DEMO_DATA_DIR"
docker compose -f docker-compose.yml -f compose.demo.yml up -d --build
```

The overlay uses its own database volume and publishes Rust demo on `127.0.0.1:18081`. From the frontend checkout run `pnpm demo` to connect Vite to that API. Production uses the same-origin `/api/` proxy and builds with `VITE_DEMO_API=false`.

## Frontend deadline header warnings

Implemented by `frontend-web`: the shared header includes Assigned, WorkInProgress and Research incidents when `(deadline - now) / (deadline - submitDate) < 0.2`, regardless of team while the deadline is still ahead. Once overdue, it remains in the header only while no resolution team is assigned (empty team or the coordinator team). Assigning a real resolution team removes the overdue warning; the queue still shows the overdue timer. Exactly 20% is excluded; overdue incidents remain eligible. Missing or invalid dates, non-positive total durations, future registration dates and Resolved/Closed incidents do not create this warning. It updates with the client clock and the existing full SSE snapshot. One incident has one card, prioritizing unresolved critical incidents regardless of team (including Research), then coordinator waiting, then deadline warning. All three header conditions trigger the bell and audio on newly eligible or materially changed cards; timer ticks stay silent. The queue SLA color threshold is also strictly below 20%, with the label «Истекает». This uses existing source fields without a new backend endpoint or schema change.

## Shift statistics

`GET /api/v1/statistics/shift?from=<RFC3339>&to=<RFC3339>` uses committed team assignments recorded by underCtrl in PostgreSQL. The interval includes `from` and excludes `to`. Invalid or reversed timestamps return `400`. An interval without recorded operations returns a successful empty result.

```bash
curl -fsSG "$API/statistics/shift" \
  --data-urlencode 'from=2026-11-21T06:00:00+03:00' \
  --data-urlencode 'to=2026-11-21T18:00:00+03:00' \
  | jq '{transferred, critical, measured, averageMs, kpiPercent,
          reassignments: ([.transfers[] | select(.reassignmentMs != null)] | length)}'
```

In accounts mode the server selects the coordinator from the session cookie. The result includes only assignments by that account and returns the login and display name in `coordinator.id` and `coordinator.name`. New assignment events identify the authenticated account explicitly. Older assignments are attributed using the recorded actor when it matches the login and differs from the configured shared actor (`DEFAULT_USER_ID`). Shared-key and open modes return shift-wide statistics with `coordinator.id: "shift"`.

The response has `source: "api"`, the profile or shift label in `coordinator`, `start`, `end`, `transferred`, `critical`, `averageMs`, `measured`, `kpiMet`, `kpiPercent`, and `transfers`. Each transfer includes the event ID, the report’s `coordinatorId`, incident ID, title, team, priority, and assignment time. Timestamps and durations use milliseconds. Waiting start, duration and KPI are `null` when historical data cannot establish a wait. KPI means assignment strictly earlier than 10 minutes after waiting began. Unknown durations do not affect the mean or denominator.

Each transfer also has `reassignmentMs` (integer or `null`). It measures the milliseconds from `previous.lastAssignmentToTeamDateTime` to the recorded dashboard assignment when moving between two different resolution teams. Coordinator, unassigned and technical groups are excluded. A missing, invalid or later previous timestamp yields `null`. The field is displayed in a separate chart. `measured`, `averageMs`, `kpiMet` and `kpiPercent` continue to use coordination wait durations.

The web Analytics view uses this response for assignment indicators, charts and PDF/Excel exports. The separately labeled shared queue uses the snapshot and available event history.

## Team directory presentation (frontend-web)

Implemented in `frontend-web`: `#teams` uses the existing `GET /teams` directory, including idle teams, and joins current snapshot incidents by the exact team name. During a directory failure it retains available names and falls back to snapshot teams. Search and team-state filters are client-side. Cards show priority/late/upcoming-deadline attention items, and counts of overdue, expiring and active incidents; Research remains active, and completed/closed incidents are excluded. The upcoming-deadline display uses the shared <20% rule. Team titles open their queue; incident links open the separate detail screen and preserve the Teams origin.

The directory displays and copies a team's `phone` from `GET /teams`. Configured phone numbers offer a `tel:` link. Test numbers are marked in the card. If no usable number is available, the card displays an empty state and disables copying. Coordinator descriptions use the configured coordinator role. Other cards use a generic resolution-team label.


## Header signals and test scenarios

Demo controls trigger server test scenarios on the isolated Rust stack. In ordinary operation the header and its chime use live snapshot data and the client clock. Newly eligible priority, coordinator-wait or deadline cards produce the signal. The waiting threshold is strictly above eight minutes and the deadline threshold is strictly below 20% of the planned interval.

Critical header persistence (Implemented, `frontend-web`): priorityId 4 stays in the header in Assigned, WorkInProgress and Research, including after team assignment and with a missing, extended or expired deadline. Resolved/Closed remove the card; reopening makes it eligible again. Lowering priority re-evaluates the remaining waiting/deadline conditions. This does not change the backend/queue critical group, where Research is still excluded, and requires no new backend route.
