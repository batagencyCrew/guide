# Hub API reference (v2)

Base `/api`. Dashboard and bot calls authenticate with a **session cookie** (dashboard)
or the **bot service token** plus `X-Bot-User: <platform>:<id>` (bot). Agent calls use
`Authorization: Bearer <site token>` only under `/api/agent/*` and `/ws/site`.
All errors are `{"detail": "..."}`. Timestamps are ISO 8601 UTC.

Startup bootstrap: if `HUB_BOOTSTRAP_OWNER` and `HUB_BOOTSTRAP_PASSWORD` (≥12 chars) are
set and the `users` table is empty, the hub creates that initial `owner` account once and
records `user.bootstrap` in `audit_log`. Once any user exists, those variables are a no-op.

## Auth — `/api/auth`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login` `{username,password}` | sets HttpOnly cookie; returns user + expiry |
| POST | `/auth/logout` | revokes the session server-side |
| GET | `/auth/me` | current user, role, permissions, scope |
| POST | `/auth/password` `{current_password,new_password}` | revokes all sessions |
| GET | `/auth/sessions` · DELETE `/auth/sessions/{id}` | list / revoke sessions |
| GET | `/auth/catalog` | all permission names and role defaults |

## Sites — `/api/sites`

`{site_ref}` accepts id, slug, or (case-insensitive) name — bots use names.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/sites` | sites:view |
| POST | `/sites` `{name,slug?,url?,description?}` → `{site, agent_token}` | sites:create |
| GET | `/sites/{ref}` | sites:view |
| PATCH | `/sites/{ref}` `{name?,url?,description?,crash_restart?}` | sites:edit |
| DELETE | `/sites/{ref}?confirm=<slug>&force=false` | sites:delete (`409` if backup uploads/transfers/downloads are active unless `force=true`) |
| GET | `/sites/{ref}/tokens` · POST `?revoke_existing=` → `{agent_token}` | sites:create |
| GET | `/sites/{ref}/workers?include_stale=` | sites:view |
| GET | `/sites/{ref}/workers/{worker_id}/samples?period=24h` | sites:view |
| POST | `/sites/{ref}/commands` `{action,args}` | per action (see below) |
| GET | `/sites/{ref}/commands?limit=` | sites:view |
| GET | `/sites/{ref}/stats?period=24h` | sites:view |

Site summary: `{id, slug, name, url, description, desired_state, crash_restart, health:
healthy|degraded|offline, online, last_seen_at, workers: {running,idle,error,stopped,
starting,unknown}, worker_total, host, process, agent_version, capabilities: {commands,
files, sdk, config_schema}}`.

Commands: `start stop restart` (control:lifecycle), `pause resume` (control:pause),
`set_workers {count}` (control:workers), `reload_config` (config:edit),
`custom:<name> {args}` (control:custom), `backup` (backups:request).
Response: `{id, action, args, status, created_at, delivered_at, completed_at, result,
source, site_name, agent_online}`. Statuses: `pending delivered running completed failed
superseded`.

## Presets & dynamic configuration — `/api/sites/{ref}`

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/sites/{ref}/presets` `{ai_api_key?, key_field?}` → `{presets:[{id,name,archived}]}` | sites:view |
| GET | `/sites/{ref}/config-schema?reveal=false` → `{fields, files, revealed}` | sites:view (`secrets:reveal` when `reveal=true`, audited as `config.reveal`) |
| PATCH | `/sites/{ref}/config-values` `{values, base_revisions?}` | config:edit |

* **Presets (`POST /sites/{ref}/presets`)**: calls `https://bambouaibot.com/api/assistant/presets`
  server-side (`follow_redirects=false`, `verify=true`, `trust_env=false`, 10 s deadline,
  1 MiB cap, max 1,000 items). Explicit `ai_api_key: null` is rejected (`422`); omit
  `ai_api_key` to decrypt the site's saved key in memory (from `key_field`, schema fields
  marked `preset_key: true`, or `ai_api_key`/`AI_API_KEY`/`ai.api_key`/`BAMBOU_API_KEY`
  across `config.json` and `.env`). The key is never returned to the browser. Upstream
  errors map cleanly: `401/403 → 400`, `429 → 503`, timeout → `504`, invalid/other → `502`.
* **Dynamic config schema (`GET /sites/{ref}/config-schema` & `PATCH /sites/{ref}/config-values`)**:
  merges any managed `.bambou-config.schema.json` with fields declared via the SDK
  (`hub.declare_config_schema` / `hub.declareConfigSchema`). Supported field types:
  `string | number | integer | boolean | select | preset | secret | multiline` with
  `key` (dotted JSON path or `.env` var), `label`, `file`, `required`, `default`, `min`,
  `max`, `options`, `description`, `secret`, `restart_required`, `group`, `preset_key`.
  `PATCH /config-values` validates types/bounds, enforces optional per-file `base_revisions`
  (`409` on conflict), supports secret `{action: "preserve" | "replace" | "clear" | "delete", value?}`
  (or `"********"` to preserve), writes atomically into the target `site_files`, and pushes
  `files_changed` to `bambou-agent`.

## Overview — `/api/overview`

`{totals:{sites,online,healthy,degraded,offline,workers_running,workers_idle,
workers_error,errors_24h,cost_today:{USD:n}}, sites:[summary], alerts:[alert]}`

## Logs & metrics

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/logs?site=&worker=&level=debug&q=&before_id=&since=&until=&limit=` | keyset paginated; `next_before_id` |
| GET | `/sites/{ref}/metrics?period=` | names, kinds, sample counts |
| GET | `/sites/{ref}/metrics/{name}?period=&worker=` | bucketed series |
| GET | `/costs?site=&period=&group_by=day|provider|category|site|worker` | totals per currency |
| GET | `/costs/events?site=&limit=` | individual cost entries |
| GET | `/balances?site=` | latest per provider; `low` flag |
| GET | `/sites/{ref}/proxy-health?period=` | per proxy: observations, ok/slow/blocked/auth/timeout, success_rate, last_state, health |

**Log ingestion & visibility:** log ingestion (`POST /api/agent/v2/batch`, `/ws/site`, and
v1 `POST /api/agent/errors`) is intentionally permissive for internal troubleshooting—no
regex/credential filtering or silent level drops are applied (level aliases such as `warn`
and `fatal` normalize cleanly, and traceback-only entries keep their exception). Access to
logs is strictly gated at read time by `sites:view` and each user's `site_scope`.

## Config files — `/api/sites/{ref}/files`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/files` | sites:view |
| POST | `/files` `{path,format?,content,secret_keys}` | config:edit |
| GET | `/files/content?path=&reveal=` | sites:view / secrets:reveal |
| PUT | `/files/content?path=` `{content,base_revision,format?,secret_keys?}` | config:edit |
| PATCH | `/files/content?path=` `{base_revision,set,delete,add_proxies,remove_proxies}` | config:edit |
| POST | `/files/validate?path=` `{content}` | sites:view |
| DELETE | `/files?path=` | config:edit |
| GET | `/files/history?path=` · `/files/history/{id}?reveal=` | sites:view |
| POST | `/files/restore?path=&revision=` | config:edit |

File view: `{path, format, revision, applied_revision, applied_at, apply_error, in_sync,
sha256, secret_keys, updated_at, content, parsed, parse_error, revealed}`.
`content` is masked unless `reveal=true` (including fields marked `secret` in the site's
`config_schema`); `parsed` is the structured view (env items, proxy entries, JSON document).
Writes return the masked view. `409` when `base_revision` is stale.

## Proxies — `/api/sites/{ref}/proxies`

Backed directly by the site's managed `proxies.txt` (`proxies`) or `proxies.json`
(`proxy-json`) in `site_files` (single source of truth; comments and JSON object style are
preserved, and every mutation increments the file revision, writes `audit_log`, and pushes
`files_changed` to `bambou-agent`). Proxy `id` is the 16-hex SHA-256 key of
`scheme|host|port|username`, matching `/proxy-health`.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/sites/{ref}/proxies?path=&reveal=false` | sites:view (`secrets:reveal` when `reveal=true`, audited) |
| POST | `/sites/{ref}/proxies` `{url? \| (host,port,scheme?), username?, password?, path?, base_revision?}` | proxies:manage |
| PATCH | `/sites/{ref}/proxies/{proxy_id}?path=` `{url?, scheme?, host?, port?, username?, password?, base_revision?}` | proxies:manage |
| DELETE | `/sites/{ref}/proxies/{proxy_id}?path=&base_revision=` | proxies:manage |
| POST | `/sites/{ref}/proxies/import` `{content, proxy_type="http", dry_run=true, path?, base_revision?}` | proxies:manage |

Batch import (`POST /proxies/import`) accepts `.txt`/`.list` text (`≤512 KiB`, `≤1,000`
entries, up to `1,000` total proxies per site), supports `host:port`, `host:port:user:pass`,
and `scheme://user:pass@host:port`, normalizes IDNA domains, IPv4, and compressed IPv6,
returns `{total, valid, duplicates, imported, can_import, dry_run, errors, entries, path,
revision}`, and commits atomically only when `dry_run=false` and `errors` is empty.

## Backups

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/backup-remotes` | backups:manage |
| GET | `/backup-storage` → `{staging_dir, used_bytes, reserved_bytes, max_bytes, free_bytes, disk_total_bytes, headroom_bytes, max_upload_bytes, cached_files, max_cached_files, retention_hours, active_downloads, active_uploads}` | backups:manage |
| GET/POST/PUT/PATCH/DELETE | `/backup-destinations[/{id}]` | sites:view (`GET`) / backups:manage |
| GET/PUT | `/sites/{ref}/backups/config` | sites:view / backups:manage |
| POST | `/sites/{ref}/backups/request` | backups:request |
| GET | `/sites/{ref}/backups?limit=` | sites:view |
| POST | `/sites/{ref}/backups/{id}/retry` | backups:manage |
| DELETE | `/sites/{ref}/backups/{id}/local` → `{ok, evicted, backup_id}` (`409` if uploading, queued/running transfer, or active download) | backups:manage |
| GET | `/sites/{ref}/backups/{id}/download` (holds a download lease until streaming completes) | backups:download |

Staging quotas are controlled via `HUB_BACKUP_MAX_UPLOAD_BYTES` (default 4 GiB),
`HUB_BACKUP_MAX_STAGING_BYTES` (default 20 GiB), `HUB_BACKUP_MAX_CACHED` (default 1,000),
and a `512 MiB` free-disk headroom check; oldest non-leased `failed`/`partial` copies are
evicted automatically when space is needed, or retained for `72` hours (`LOCAL_KEEP_HOURS`).

## Alerts

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/alerts?status=active|open|acknowledged|resolved|all&site=&limit=` | sites:view |
| POST | `/alerts/{id}/ack` · `/mute` `{minutes}` · `/resolve` | alerts:ack |
| GET | `/alerts/rules` → `{kinds, rules}` | sites:view |
| POST/PUT/DELETE | `/alerts/rules[/{id}]` | alerts:manage |
| GET/PUT | `/alerts/channels` (default delivery channels) | sites:view / alerts:manage |

Rule kinds: `site_offline worker_idle worker_error worker_silent error_spike cost_daily
balance_low backup_failed proxy_failing issue`.

## Users & bots

| Method | Path | Permission |
| --- | --- | --- |
| GET/POST | `/users` · PATCH `/users/{id}` | users:manage |
| POST | `/me/bot-link-code` → `{code}` (10 min, shown once) | sites:view |
| GET/DELETE | `/me/bot-links[/{platform}/{id}]` | sites:view |
| GET | `/bot-links` | bots:manage |
| POST | `/service-tokens/bot` → `{token}`; GET `/service-tokens`; DELETE `/service-tokens/{id}` | bots:manage |
| GET | `/audit?site=&actor=&action=&before_id=&limit=` | users:audit |

Bot-only (`Authorization: Bearer hbt_…`): `POST /api/bot/link {platform,platform_user,code}`,
`POST /api/bot/identity`, `POST /api/bot/unlink`, `GET /api/bot/deliveries`,
`POST /api/bot/deliveries/{id}`.

## Agent (site token)

HTTP: `POST /api/agent/v2/batch`, `GET /api/agent/v2/commands`,
`POST /api/agent/v2/commands/{id}/ack`, `GET /api/agent/v2/files`,
`POST /api/agent/v2/files/ack`, `POST /api/agent/v2/files/push`,
`GET /api/agent/v2/whoami`, `GET /api/agent/v2/backups/config`,
`POST /api/agent/v2/backups/upload?source=&command_id=&size=`.
WebSocket `GET /ws/site` (Authorization header) carries the same batch/command traffic.

The v1 agent compatibility API (`/api/agent/heartbeat`, `/config`, `/local-sync`, `/errors`,
`/commands`, `/commands/{id}/ack`, `/statistics`, `/ai-usage`, `/chats`, `/backup-config`,
`/backup-status`, `/backup-requests`, `/backup-requests/{id}/ack`, `/backups/upload`) maps
cleanly onto v2 storage: heartbeat `degraded` status updates site health, `local-sync`
enforces `expected_revision` (`409`), proxy error codes populate `proxy_observations`,
`chats` and `ai-usage` deduplicate by `event_id` (`agent_receipts`, `409` on payload
mismatch), `backup-status` accepts ISO 8601 strings or Unix timestamps, and on-demand
uploads complete the matching `backup` command (0-byte uploads are rejected with `400`).
