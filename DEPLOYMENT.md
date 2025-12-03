# Deployment Configuration

## Environment Variables

### Frontend (Build-time)

These are set in GitHub Actions and baked into the frontend build:

```bash
VITE_AUTH0_DOMAIN=auth.konnektr.io
VITE_AUTH0_CLIENT_ID=ObWW1A2syc8tFeYkxTwnRvRdNgbuP9BE
VITE_AUTH0_KTRLPLANE_AUDIENCE=https://ktrlplane.konnektr.io
VITE_AUTH0_GRAPH_AUDIENCE=https://graph.konnektr.io
```

### Proxy Backend (Runtime)

This should be set in your Kubernetes deployment:

```yaml
env:
  - name: KTRLPLANE_BASE_URL
    value: "http://ktrlplane-backend-service.ktrlplane.svc.cluster.local/api/v1"
```

**Note:** The base URL includes `/api/v1` as all KtrlPlane API endpoints are under this path.

## GitHub Variables Required

Ensure these variables are set in your GitHub repository settings:

- `AUTH0_DOMAIN` = `auth.konnektr.io`
- `AUTH0_CLIENT_ID` = `ObWW1A2syc8tFeYkxTwnRvRdNgbuP9BE`
- `AUTH0_KTRLPLANE_AUDIENCE` = `https://ktrlplane.konnektr.io`
- `AUTH0_GRAPH_AUDIENCE` = `https://graph.konnektr.io`

## KtrlPlane API Endpoint

The proxy backend will call:

```
http://ktrlplane-backend-service.ktrlplane.svc.cluster.local/api/v1/resources?resource_type=graph
```

This endpoint should return all Graph resources the authenticated user has access to.
