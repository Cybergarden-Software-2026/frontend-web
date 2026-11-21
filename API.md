# underCtrl incident dashboard HTTP API

Contract for the Rust API used by the web dashboard. [Frontend client](https://github.com/Cybergarden-Software-2026/frontend-web/blob/main/src/data/api.ts) · [OpenAPI schema](https://github.com/Cybergarden-Software-2026/backend/blob/main/crates/api/static/openapi.json)

## Implementation status

Status reflects the committed implementation in the owning repository. Production availability also depends on deployment and configuration. Paths in this table start at the host root.

| Capability | Owning repository | Status |
|---|---|---|
| `GET /api/v1/snapshot` and `GET /api/v1/dashboard` | `backend` | Implemented |
| `GET /api/v1/incidents` with page and cursor pagination, and `GET /api/v1/incidents/{key}` | `backend` | Implemented |
| `GET /api/v1/teams` and rules-based `GET /api/v1/incidents/{key}/analysis` | `backend` | Implemented |
| `POST /api/v1/incidents/{sysId}/assignment` with a coordinator bearer token | `backend` | Implemented |
| Coordinator key entry, optional local persistence and logout (client-side only) | `frontend-web` | Implemented |
| Username/password login, refresh tokens and server session validation | `backend` | Not implemented |
| Assignment without a coordinator bearer token | `backend` and `frontend-web` | Not implemented |
| LLM-backed incident analysis | `backend` | Not implemented |
| `GET /api/v1/events`, `GET /api/v1/events/stream`, and `GET /api/v1/incidents/{key}/events` | `backend` | Implemented |
| `GET /api/v1/notifications` and `PUT /api/v1/notifications/{notification_id}/read` | `backend` | Implemented |
| `GET /api/v1/openapi.json`, `GET /api/docs`, `GET /redoc`, and `GET /docs/oauth2-redirect` | `backend` | Implemented |
| `GET /health` and `GET /health/ready` | `backend` | Implemented |
| Same-origin `/api` proxy and `GET /healthz` | `frontend-web` | Implemented |
| `POST /api/v1/demo` and `PUT /api/v1/incidents` | `backend` | Not implemented |

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
| List available teams | `GET /teams` | Team names and active assignment counts |
| View analysis | `GET /incidents/{key}/analysis` | Facts, items requiring attention, and candidate teams |
| Assign a team | `POST /incidents/{sysId}/assignment` | Full snapshot after the operation |

Reads and SSE subscriptions are available without an application token. Team assignment requires a coordinator bearer token. A public reverse proxy may require its own authentication before forwarding dashboard and API requests.

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

Each incident includes source fields such as `header`, `stateEnum`, `priorityId`, `service`, and `assignedGroupName`. Optional source fields can be absent or `null`. The `dashboard` object adds the incident revision `incidentRevision`, the normalized state, groups, SLA information, and an `itsmUrl` link. In the web view, `dashboard.sourceDates` contains dates that the importer has already converted to UTC. Paginated queue results and successful assignment responses include this object as well.

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

**Directory.** `GET /teams` returns `{"items":[{"name":"Team A","activeCount":3}],"revision":12}`. The directory includes teams with no active assignments. `activeCount` counts currently present incidents assigned to the team, excluding resolved and closed incidents. Copy the exact `name` when assigning a team.

**Analysis.** `GET /incidents/{key}/analysis` accepts the `sysId` or ticket number `id` of an incident that is still present. The response contains `sysId`, `revision`, `generatedAt`, `provider` (currently `rules`), `summary`, `facts` (pairs of `label` and `value`), `attention`, `missing`, and `candidates`. Each candidate has `team`, `evidenceIds`, and `reason`. The algorithm suggests up to three teams based on completed cases that have a completion date and match either the service or the combination of scenario and product. `evidenceIds` contains `INC…` ticket numbers. The candidate array is empty when there is insufficient evidence.

```bash
curl -fsS "$API/teams" | jq '.items[] | {name, activeCount}'
curl -fsS "$API/incidents/$SYS_ID/analysis" | jq '{summary, attention, candidates, missing}'
```

**Assignment.** `POST /incidents/{sysId}/assignment` requires the incident's `sysId`. The JSON body contains the chosen team name and the snapshot revision the coordinator saw. The committed backend requires the header `Authorization: Bearer <token>`. The coordinator token must match the backend's configured `ASSIGNMENT_TOKEN`.

```json
{"team":"Storage Operations","expectedRevision":12}
```

Run this example on the workstation hosting a disposable Rust API. Use the direct backend address, set `ASSIGNMENT_TOKEN` to that environment's coordinator token, and replace `TEST_SYS_ID` and the sample team with values from the test API. The following commands fetch the snapshot, display the current assignment, and save the revision. The POST request assigns the selected team.

```bash
ASSIGNMENT_API='http://127.0.0.1:8080/api/v1'
TEST_SYS_ID='123456789012345678'
snapshot=$(curl -fsS "$ASSIGNMENT_API/snapshot?view=web")
printf '%s' "$snapshot" | jq --arg id "$TEST_SYS_ID" '.items[] | select(.sysId == $id) | {id, header, assignedGroupName}'
revision=$(printf '%s' "$snapshot" | jq -er '.revision')
team='Storage Operations'
curl -sS -i "$ASSIGNMENT_API/incidents/$TEST_SYS_ID/assignment" \
  -H "Authorization: Bearer $ASSIGNMENT_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary "$(jq -nc --arg team "$team" --argjson rev "$revision" '{team:$team,expectedRevision:$rev}')"
```

On `200`, the client receives the full web snapshot. Changing the team clears the previous individual assignee, updates the assignment timestamp, and publishes the change through SSE. The incident's state stays the same. Selecting the current team again with a current revision returns a snapshot at the same revision. The assignment persists in PostgreSQL across re-imports of the old export. A change to the assignment fields in ITSM, closure or resolution of the incident, or removal of the incident from the export returns control to the source.

On `409` with `currentRevision`, fetch the snapshot again, display the current team, and ask the coordinator to confirm the choice again. The API returns a separate `409` for incidents in `Resolved` or `Closed` state.

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

Change reasons are `import`, `source`, `expiry`, and `assignment`. On `stream.reset`, the server sends `schemaVersion`, `reason`, and the current `eventCursor`, then closes the stream. Reset reasons are `invalid_cursor`, `cursor_ahead`, and `cursor_expired`. The client should close its old subscription, fetch a new snapshot, and open a stream using the returned cursor. Both `since` and `Last-Event-ID` are limited to 32 characters.

## 5. Incident details, history, and notifications

| Route | Parameters and response |
|---|---|
| `GET /dashboard` | Compact summary with `eventCursor`, `serverTime`, `source`, `groups`, and `incidents`. The `incidents` object is keyed by ticket number `id`. |
| `GET /incidents/{key}` | Incident details by `sysId` or ticket number `id`. The response contains `incident`, `revision`, `normalizedState`, and `details`. Use `details.isPresent` to check whether the record is still in the export. |
| `GET /events` | Global event history. Filters are `afterId`, `beforeId`, `type`, `incidentSysId` (up to 64 characters), and `limit`. Returns `items` and `nextCursor`. To get JSON, omit `since` and use a standard `Accept` header. Passing `since` or `Accept: text/event-stream` selects SSE `notify` mode on this route. |
| `GET /incidents/{key}/events` | History for one incident. Parameters are `beforeId` and `limit`. Returns `items` and `nextCursor`. |
| `GET /notifications` | Parameters are `cursor` and `limit`. Returns `items`, `nextCursor`, and `unreadCount`. Each notification has `id`, `type`, `title`, `body`, `isRead`, `readAt`, and references to the related incident or event when available. |
| `PUT /notifications/{notification_id}/read` | Takes a positive numeric notification ID. Send an empty body. The successful response is `204 No Content`. Marking an already-read notification yields the same response. |

History and notification lists return records newest first. `limit` defaults to 50 and accepts 1–200. In history requests, `afterId` and `beforeId` are exclusive bounds on **eventId**. To fetch older events, send `nextCursor` as `beforeId`. For notifications, send it as `cursor`. A cursor of `null` ends pagination. These cursors contain up to 18 decimal digits.

A history event contains `eventId`, `revision`, `incidentRevision`, `sysId`, `incidentId`, `header`, `at`, the arrays `types` and `fields`, and the source records `previous` and `current`, each of which may be `null`. One event can have multiple types. The `type` filter accepts one of `created`, `critical`, `assigned`, `resolved`, `closed`, `reopened`, `research`, `deadline`, `team`, `priority`, `changed`, or `removed`. SSE subscription cursors track snapshot revisions. History cursors track individual events.

Both notification routes accept `X-User-Id` to maintain read state per user. It allows 1–64 characters from `A–Z`, `a–z`, `0–9`, `_`, `.`, `@`, and `-`. If omitted, the server uses `DEFAULT_USER_ID`, typically `coordinator`.

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
| 401 | `ASSIGNMENT_UNAUTHORIZED` | The coordinator bearer token is missing or invalid. |
| 403 | `ASSIGNMENT_DISABLED` | The server has no configured `ASSIGNMENT_TOKEN`. |
| 404 | `INCIDENT_NOT_FOUND`, `NOTIFICATION_NOT_FOUND`, `NOT_FOUND` | Resource identifier or path. Assignment requires the `sysId`. |
| 405 | `METHOD_NOT_ALLOWED` | HTTP method for the route. |
| 409 | `CONFLICT`, `CURSOR_EXPIRED` | Assignment revision, incident state, or queue cursor. |
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

The Rust backend importer reads incidents from an export file. The local demo adapter in `frontend-web` provides `POST /api/v1/demo` for simulation and `PUT /api/v1/incidents` for full data replacement.

## Frontend coordinator session

The web client provides a key-entry screen. With “Remember on this device” selected, it stores the coordinator key locally, scoped to the current origin and API prefix, and restores it after a reload. Without that choice the key remains in memory for the current tab. It sends the key only on assignment requests, never in URLs, read requests or SSE. Logout clears the key and cached incident data. A 401 for the current key returns the client to key entry; a late rejection of a previous session does not clear a newer one.

This is client-side key storage, not a new backend login capability. The existing backend validates the key on assignment; there is no read-only key-validation, login or refresh endpoint. Reads and SSE retain their existing public contract. No backend route or schema is changed by this frontend behaviour.
