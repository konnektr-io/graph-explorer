"""
Minimal ADT-compatible Digital Twins API used to exercise the graph-explorer
delete UI in a real browser.

Implements just enough of the ADT surface: model listing, twin queries, and
twin/relationship deletion with the real cascade semantics (ADT refuses to
delete a twin that still has relationships — HTTP 409).

Shape notes that matter when driving the @azure/digital-twins-core SDK:
  - GET  /models  -> {"value": [ {id, displayName, model:{...}} ]}   (ARRAY)
  - POST /query   -> {"value": [ ...rows ]}   (the SDK POSTs the query body)
  - DELETE /digitaltwins/{id}                       -> 204 / 409 / 404
  - DELETE /digitaltwins/{sid}/relationships/{rid}  -> 204 / 404
"""
import json
import re
import ssl
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELS = [
    {
        "@id": "dtmi:com:example:Building;1",
        "@type": "Interface",
        "displayName": "Building",
        "contents": [],
    },
    {
        "@id": "dtmi:com:example:Room;1",
        "@type": "Interface",
        "displayName": "Room",
        "contents": [
            {"@type": "Property", "name": "roomNumber", "schema": "string",
             "displayName": "Room Number"},
            {"@type": "Relationship", "name": "contains",
             "target": "dtmi:com:example:Pump;1"},
        ],
    },
    {
        "@id": "dtmi:com:example:Pump;1",
        "@type": "Interface",
        "displayName": "Pump",
        "contents": [
            {"@type": "Property", "name": "capacity", "schema": "double"},
            {"@type": "Relationship", "name": "feeds",
             "target": "dtmi:com:example:Room;1"},
        ],
    },
]

_SEED_TWINS = {
    "building-1": {"$dtId": "building-1",
                   "$metadata": {"$model": "dtmi:com:example:Building;1"},
                   "name": "Main Plant"},
    "room-1": {"$dtId": "room-1",
               "$metadata": {"$model": "dtmi:com:example:Room;1"},
               "name": "Pump Hall", "roomNumber": "A-101"},
    "pump-1": {"$dtId": "pump-1",
               "$metadata": {"$model": "dtmi:com:example:Pump;1"},
               "name": "Pump A", "capacity": 250.0},
    "pump-2": {"$dtId": "pump-2",
               "$metadata": {"$model": "dtmi:com:example:Pump;1"},
               "name": "Pump B", "capacity": 310.0},
}

_SEED_RELS = {
    ("room-1", "r-contains"): {"$relationshipId": "r-contains",
                               "$relationshipName": "contains",
                               "$sourceId": "room-1", "$targetId": "pump-1"},
    ("room-1", "r-contains-2"): {"$relationshipId": "r-contains-2",
                                 "$relationshipName": "contains",
                                 "$sourceId": "room-1", "$targetId": "pump-2"},
    ("pump-2", "r-feeds"): {"$relationshipId": "r-feeds",
                            "$relationshipName": "feeds",
                            "$sourceId": "pump-2", "$targetId": "building-1"},
}

TWINS, RELS = {}, {}


def reset():
    TWINS.clear()
    TWINS.update({k: json.loads(json.dumps(v)) for k, v in _SEED_TWINS.items()})
    RELS.clear()
    RELS.update({k: json.loads(json.dumps(v)) for k, v in _SEED_RELS.items()})


def run_query(q):
    """Tiny subset of the ADT query language that the app actually issues."""
    flat = " ".join(q.split())
    up = flat.upper()

    if "FROM RELATIONSHIPS" in up:
        rows = list(RELS.values())
        # The app filters relationships either by one endpoint
        #   WHERE $sourceId = 'x'            /  WHERE $targetId = 'x'
        # or, for "all" relationships, by both joined with OR:
        #   WHERE $targetId = 'x' OR $sourceId = 'x'
        # Honour the OR — filtering with AND silently returns nothing and
        # breaks the delete cascade.
        clauses = re.findall(
            r"\$(sourceId|targetId)\s*=\s*'([^']+)'", flat)
        if clauses:
            rows = [r for r in rows
                    if any(r[f"${field}"] == val for field, val in clauses)]
        return rows

    rows = list(TWINS.values())
    m = re.search(r"IS_OF_MODEL\(\s*'([^']+)'", flat)
    if m:
        rows = [t for t in rows if t["$metadata"]["$model"] == m.group(1)]
    if re.search(r"SELECT\s+\$metadata\.\$model", up):
        rows = [{"$metadata": {"$model": t["$metadata"]["$model"]}} for t in rows]
    return rows


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _send(self, code, body=None):
        payload = b"" if body is None else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if payload:
            self.wfile.write(payload)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        p = u.path.rstrip("/")

        if p == "/healthz":
            return self._send(200, {"status": "ok"})
        if p == "/models":
            docs = [{
                "id": m["@id"],
                "displayName": m.get("displayName", m["@id"].split(":")[-1]),
                "uploadTime": "2024-01-01T00:00:00Z",
                "decommissionTime": None,
                "dependencies": [], "dependenciesFor": [],
                "model": m,
            } for m in MODELS]
            return self._send(200, {"value": docs, "nextLink": None})
        if p == "/query":
            q = urllib.parse.parse_qs(u.query).get("query", [""])[0]
            return self._send(200, {"value": run_query(q), "nextLink": None})
        if p.startswith("/digitaltwins/"):
            tid = p.split("/digitaltwins/", 1)[1]
            if tid in TWINS:
                return self._send(200, TWINS[tid])
            return self._send(404, {"error": {"code": "TwinNotFound", "message": tid}})
        return self._send(404, {"error": {"code": "NotFound", "message": p}})

    def do_POST(self):
        """ADT's query API is POST /query with the query in the request body."""
        u = urllib.parse.urlparse(self.path)
        if u.path.rstrip("/") == "/__reset":
            # Test-only: restore the seed graph so a run is reproducible.
            reset()
            return self._send(200, {"status": "reset"})
        if u.path.rstrip("/") != "/query":
            return self._send(404, {"error": {"code": "NotFound", "message": u.path}})
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n).decode() if n else ""
        try:
            q = json.loads(raw).get("query", "")
        except json.JSONDecodeError:
            q = urllib.parse.parse_qs(u.query).get("query", [""])[0]
        return self._send(200, {"value": run_query(q), "nextLink": None})

    def do_DELETE(self):
        p = urllib.parse.urlparse(self.path).path.rstrip("/")

        m = re.match(r"^/digitaltwins/([^/]+)/relationships/([^/]+)$", p)
        if m:
            src, rid = m.group(1), m.group(2)
            if (src, rid) in RELS:
                del RELS[(src, rid)]
                return self._send(204)
            return self._send(404, {"error": {
                "code": "RelationshipNotFound", "message": f"{src}/{rid}"}})

        m = re.match(r"^/digitaltwins/([^/]+)$", p)
        if m:
            tid = m.group(1)
            if tid not in TWINS:
                return self._send(404, {"error": {
                    "code": "TwinNotFound", "message": tid}})
            touching = [r for r in RELS.values()
                        if r["$sourceId"] == tid or r["$targetId"] == tid]
            if touching:
                return self._send(409, {"error": {
                    "code": "DigitalTwinDeleteRelationshipsNotAllowed",
                    "message": (f"Cannot delete twin '{tid}' because it has "
                                f"{len(touching)} relationship(s). "
                                "Delete them first.")}})
            del TWINS[tid]
            return self._send(204)

        return self._send(404, {"error": {"code": "NotFound", "message": p}})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5600
    cert, key = sys.argv[2], sys.argv[3]
    reset()
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    print(f"mock-adt (TLS) on https://127.0.0.1:{port}", flush=True)
    srv.serve_forever()
