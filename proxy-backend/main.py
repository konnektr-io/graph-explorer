from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import logging
import os
import re

app = FastAPI()
logger = logging.getLogger("proxy")
logging.basicConfig(level=logging.INFO)

PROXY_PREFIX = "/api/proxy"
KTRLPLANE_PROXY_PREFIX = "/api/ktrlplane"
KTRLPLANE_BASE_URL = os.getenv(
    "KTRLPLANE_BASE_URL",
    "http://ktrlplane-backend-service.ktrlplane.svc.cluster.local:8080/api/v1",
)


@app.api_route(
    f"{PROXY_PREFIX}/{{full_path:path}}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy(full_path: str, request: Request):
    adt_host = request.headers.get("x-adt-host")
    if not adt_host:
        logger.warning("No x-adt-host header found")
        raise HTTPException(status_code=400, detail="Missing x-adt-host header")

    # Use http for internal cluster services (.cluster.local, with or without port)
    # If port is missing for .cluster.local, append :8080
    cluster_local_pattern = r"\.cluster\.local(:\d+)?$"
    if re.search(cluster_local_pattern, adt_host):
        protocol = "http"
        # Check if port is present
        if not re.search(r"\.cluster\.local:\d+$", adt_host):
            adt_host += ":8080"
    else:
        protocol = "https"
    target_url = f"{protocol}://{adt_host}/{full_path}"
    logger.info(f"Proxying {request.method} {request.url.path} -> {target_url}")

    # Prepare request to backend
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("x-adt-host", None)
    headers.pop("origin", None)
    headers.pop("referer", None)

    try:
        async with httpx.AsyncClient(verify=True) as client:
            req = client.build_request(
                request.method,
                target_url,
                headers=headers,
                content=await request.body(),
            )
            resp = await client.send(req, stream=True)
            logger.info(
                f"Response: {resp.status_code} ({resp.headers.get('content-length', 'unknown')} bytes)"
            )
            return StreamingResponse(
                resp.aiter_raw(),
                status_code=resp.status_code,
                headers={
                    k: v
                    for k, v in resp.headers.items()
                    if k.lower() != "content-length"
                },
            )
    except Exception as e:
        logger.error(f"Proxy error: {e}")
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


@app.api_route(
    f"{KTRLPLANE_PROXY_PREFIX}/{{full_path:path}}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def ktrlplane_proxy(full_path: str, request: Request):
    """
    Proxy requests to KtrlPlane API
    Forwards Authorization header for authentication
    """
    target_url = f"{KTRLPLANE_BASE_URL}/{full_path}"
    logger.info(f"Proxying {request.method} {request.url.path} -> {target_url}")

    # Prepare request to KtrlPlane
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("origin", None)
    headers.pop("referer", None)

    try:
        async with httpx.AsyncClient(verify=True, timeout=30.0) as client:
            req = client.build_request(
                request.method,
                target_url,
                headers=headers,
                content=await request.body(),
                params=request.query_params,
            )
            resp = await client.send(req, stream=True)
            logger.info(
                f"Response: {resp.status_code} ({resp.headers.get('content-length', 'unknown')} bytes)"
            )
            return StreamingResponse(
                resp.aiter_raw(),
                status_code=resp.status_code,
                headers={
                    k: v
                    for k, v in resp.headers.items()
                    if k.lower() != "content-length"
                },
            )
    except httpx.ConnectError as e:
        logger.error(f"KtrlPlane connection error - cannot reach {target_url}: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Cannot connect to KtrlPlane API at {target_url}. Service may be unavailable.",
        )
    except httpx.TimeoutException as e:
        logger.error(f"KtrlPlane timeout error for {target_url}: {e}")
        raise HTTPException(
            status_code=504, detail=f"Timeout connecting to KtrlPlane API: {str(e)}"
        )
    except Exception as e:
        logger.error(f"KtrlPlane proxy error: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


@app.get("/healthz")
def health():
    return {"status": "ok"}
