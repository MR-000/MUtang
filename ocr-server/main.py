import os
import time
import logging
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, UploadFile, File, HTTPException, Form, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from ocr_service import OcrService
from structure_service import StructureService
from face_service import FaceService
from llm_service import LlmService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("mutang-ocr")

MAX_FILE_SIZE = int(os.environ.get("OCR_MAX_FILE_SIZE", str(20 * 1024 * 1024)))
RATE_LIMIT_WINDOW = int(os.environ.get("OCR_RATE_LIMIT_WINDOW", "60"))
RATE_LIMIT_MAX = int(os.environ.get("OCR_RATE_LIMIT_MAX", "30"))
SERVER_HOST = os.environ.get("OCR_SERVER_HOST", "127.0.0.1")
CORS_ORIGINS_RAW = os.environ.get("OCR_CORS_ORIGINS", "")


def parse_cors_origins(raw: str) -> list[str]:
    raw = raw.strip()
    if not raw or raw == "*":
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


cors_origins = parse_cors_origins(CORS_ORIGINS_RAW)
cors_credentials = cors_origins != ["*"]


class RateLimiter:
    def __init__(self):
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def check(self, ip: str) -> bool:
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW
        bucket = self._buckets[ip]
        bucket[:] = [t for t in bucket if t > window_start]
        if len(bucket) >= RATE_LIMIT_MAX:
            return False
        bucket.append(now)
        return True


_rate_limiter = RateLimiter()


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        api_key = os.environ.get("OCR_SERVER_API_KEY", "")
        path = request.url.path

        if path == "/health":
            return await call_next(request)

        if api_key:
            req_key = request.headers.get("X-API-Key", "")
            if not req_key or req_key != api_key:
                return Response(status_code=401, content='{"error":"Unauthorized"}', media_type="application/json")

        client_ip = request.client.host if request.client else "unknown"
        if not _rate_limiter.check(client_ip):
            return Response(status_code=429, content='{"error":"Too Many Requests"}', media_type="application/json")

        if request.method in ("POST", "PUT", "PATCH"):
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > MAX_FILE_SIZE:
                return Response(status_code=413, content='{"error":"File too large"}', media_type="application/json")

        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading PP-OCRv6 Medium model ...")
    app.state.ocr = OcrService()
    logger.info("PP-OCRv6 Medium loaded")

    logger.info("Loading PP-StructureV3 model ...")
    app.state.structure = StructureService()
    logger.info("PP-StructureV3 loaded")

    logger.info("Loading InsightFace model ...")
    app.state.face = FaceService()
    logger.info("InsightFace loaded")

    logger.info("Initializing LLM service (mode: %s, opencode serve: %s) ...",
                os.environ.get("LLM_MODE", "auto"),
                os.environ.get("OPENCODE_SERVER_URL", "http://127.0.0.1:4096"))
    app.state.llm = LlmService()
    logger.info("LLM service ready")

    yield

    logger.info("Shutting down OCR server")


app = FastAPI(
    title="MUtang OCR Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityMiddleware)


@app.get("/health")
async def health(request: Request):
    llm = request.app.state.llm
    llm_backends = []
    if llm.is_local_available:
        llm_backends.append("local")
    if llm.is_cloud_available:
        llm_backends.append("cloud")
    return {
        "status": "ok",
        "ocr": "PP-OCRv6 Medium",
        "structure": "PP-StructureV3",
        "face": "InsightFace",
        "llm": llm_backends or ["none"],
        "llm_mode": llm._mode,
    }


async def _read_upload(file: UploadFile) -> bytes:
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")
    return contents


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    contents = await _read_upload(file)
    result = app.state.ocr.recognize(contents)
    return result


@app.post("/structure")
async def structure(file: UploadFile = File(...)):
    contents = await _read_upload(file)
    result = app.state.structure.analyze(contents)
    return result


@app.post("/face-verify")
async def face_verify(
    id_image: UploadFile = File(...),
    selfie_image: UploadFile = File(...),
):
    id_bytes = await _read_upload(id_image)
    selfie_bytes = await _read_upload(selfie_image)
    result = app.state.face.verify(id_bytes, selfie_bytes)
    return result


@app.post("/gcash-ocr")
async def gcash_ocr(file: UploadFile = File(...), expected_amount: str = Form("")):
    contents = await _read_upload(file)
    result = app.state.ocr.recognize_receipt(contents, expected_amount)
    return result


@app.post("/ocr-verify")
async def ocr_verify(
    file: UploadFile = File(...),
    doc_type: str = Form("receipt"),
    expected_amount: str = Form(""),
):
    contents = await _read_upload(file)

    ocr_result = app.state.ocr.recognize(contents)

    llm_result = app.state.llm.verify_ocr(
        ocr_text=ocr_result.get("text", ""),
        doc_type=doc_type,
    )

    return {
        "success": True,
        "ocr": ocr_result,
        "llm_verification": llm_result,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("OCR_SERVER_PORT", "8000"))
    dev_mode = os.environ.get("OCR_DEV", "0") == "1"
    uvicorn.run("main:app", host=SERVER_HOST, port=port, reload=dev_mode)
