# E2E harness (test-only)

Manual browser verification of the twin/relationship delete UI. Not part of the
shipped app and not wired into CI — it exists so the delete flow can be
re-checked in a real browser without an Azure Digital Twins instance.

## Why a mock backend

`deleteTwin`/`deleteRelationship` talk to an ADT-compatible API, and the public
demo host is not reachable from every environment. The mock speaks the small
slice of the ADT surface the app actually uses, with the two behaviours that
matter for deletion:

- **409 on a twin that still has relationships** (real ADT behaviour), so the
  cascade in `deleteTwin` is genuinely exercised — if the app forgot to delete
  relationships first, the twin delete fails loudly.
- Relationship ids are scoped per source twin, matching ADT.

## Running it

```bash
cd .e2e

# TLS cert for the mock (the vite dev proxy always rewrites the host to https://)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 2 -nodes \
  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

python3 mock_adt.py 5600 cert.pem key.pem      # backend, serves :5600

# in another shell, from ../frontend
npx vite --port 5200 --host 127.0.0.1

python3 e2e_delete.py                           # drive the UI
```

`e2e_delete.py` resets the mock on start, so runs are repeatable.

## What it covers

1. Delete an **incoming** relationship from the twin inspector.
2. Delete a relationship from the **relationship** inspector.
3. Delete a **twin** and assert the cascade removed its relationships too.
4. Assert the deleted entities disappear from the query results the table and
   graph render from (including a nested row shape).

## SDK shape gotchas (cost real debugging time — keep in mind when extending)

- `GET /models` must return `{"value": [...]}` as an **array** of
  `{id, displayName, model}`. Returning the `{id: model}` map makes
  `listModels()` yield map keys, and `ModelSidebar` then crashes on
  `getModelDisplayName(undefined)`.
- Queries are **POST** `/query` with `{"query": "..."}` in the body.
- Relationship filters joined with `OR` (`... WHERE $targetId = 'x' OR
  $sourceId = 'x'`) must be honoured as OR. Filtering as AND silently returns
  nothing and breaks the delete cascade.
- Row-level delete buttons are `opacity-0 group-hover:opacity-100`, so they
  have no clickable box until hovered — `hover()` first, then click.
- The onboarding modal overlays the app on first load and intercepts clicks;
  the script dismisses it first.
