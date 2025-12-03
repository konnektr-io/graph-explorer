from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import logging
import os

app = FastAPI()
logger = logging.getLogger("proxy")
logging.basicConfig(level=logging.INFO)

PROXY_PREFIX = "/api/proxy"
KTRLPLANE_PROXY_PREFIX = "/api/ktrlplane"
KTRLPLANE_BASE_URL = os.getenv(
    "KTRLPLANE_BASE_URL", "https://api.ktrlplane.konnektr.io"
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

    target_url = f"https://{adt_host}/{full_path}"
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
        async with httpx.AsyncClient(verify=True) as client:
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
    except Exception as e:
        logger.error(f"KtrlPlane proxy error: {e}")
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


@app.get("/healthz")
def health():
    return {"status": "ok"}
