import os
import re
import json
import logging

import httpx

logger = logging.getLogger("mutang-ocr.llm_service")

DEEPSEEK_API_URL = os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
OPENCODE_SERVER_URL = os.environ.get("OPENCODE_SERVER_URL", "http://127.0.0.1:4096")
OPENCODE_MODEL_NAME = os.environ.get("OPENCODE_MODEL", "opencode/deepseek-v4-flash-free")
CLOUD_MODEL = os.environ.get("DEEPSEEK_CLOUD_MODEL", "deepseek-chat")
OPENCODE_TIMEOUT = float(os.environ.get("OPENCODE_TIMEOUT", "120"))
CLOUD_TIMEOUT = float(os.environ.get("CLOUD_TIMEOUT", "30"))
HEALTH_CHECK_TIMEOUT = float(os.environ.get("HEALTH_CHECK_TIMEOUT", "3"))


def _parse_opencode_model(name: str) -> dict:
    parts = name.split("/", 1)
    if len(parts) == 2:
        return {"providerID": parts[0], "modelID": parts[1]}
    return {"providerID": "opencode", "modelID": name}


class LlmService:
    def __init__(self):
        self._api_key = DEEPSEEK_API_KEY
        self._mode = os.environ.get("LLM_MODE", "auto")
        self._opencode_checked = False
        self._opencode_available = False
        self._cloud_enabled = bool(self._api_key)
        self._opencode_model = _parse_opencode_model(OPENCODE_MODEL_NAME)

        if self._cloud_enabled:
            logger.info("Cloud DeepSeek LLM configured (model: %s)", CLOUD_MODEL)
        if self._mode in ("local", "auto"):
            logger.info("OpenCode LLM configured (lazy check, server: %s, model: %s)", OPENCODE_SERVER_URL, OPENCODE_MODEL_NAME)
        if not self._cloud_enabled and self._mode == "cloud":
            logger.warning("LLM_MODE=cloud but DEEPSEEK_API_KEY not set")
        if not self._cloud_enabled and self._mode != "local":
            logger.info("No cloud API key — will try OpenCode at runtime")

    @property
    def is_local_available(self) -> bool:
        if not self._opencode_checked:
            self._opencode_available = self._check_opencode()
            self._opencode_checked = True
        return self._opencode_available

    @property
    def is_cloud_available(self) -> bool:
        return self._cloud_enabled

    def _check_opencode(self) -> bool:
        try:
            with httpx.Client(timeout=HEALTH_CHECK_TIMEOUT) as client:
                resp = client.get(f"{OPENCODE_SERVER_URL}/global/health")
                return resp.status_code == 200 and resp.json().get("healthy") is True
        except Exception:
            return False

    def _build_verification_prompt(self, ocr_text: str, doc_type: str = "receipt") -> str:
        if doc_type == "receipt":
            return f"""You are a financial OCR verification assistant. Given the raw OCR text from a payment receipt, extract and return ONLY a valid JSON object with no markdown formatting:

{{
  "ref_no": "extracted reference number or empty string",
  "amount": "extracted amount or empty string",
  "date": "extracted date or empty string",
  "sender": "extracted sender name or empty string",
  "is_valid": true/false
}}

Raw OCR text:
```
{ocr_text}
```"""
        elif doc_type == "id":
            return f"""You are an ID document verification assistant. Given the raw OCR text from an identification document, extract and return ONLY a valid JSON object with no markdown formatting:

{{
  "id_number": "extracted ID number or empty string",
  "full_name": "extracted full name or empty string",
  "date_of_birth": "extracted DOB or empty string",
  "nationality": "extracted nationality or empty string",
  "is_valid": true/false
}}

Raw OCR text:
```
{ocr_text}
```"""
        else:
            return f"""You are an OCR result formatter. Given the raw OCR text, extract all meaningful information and return ONLY a valid JSON object with no markdown formatting.

Raw OCR text:
```
{ocr_text}
```"""

    def verify_ocr(self, ocr_text: str, doc_type: str = "receipt") -> dict:
        local_ok = self.is_local_available if (self._mode in ("local", "auto")) else False
        cloud_ok = self.is_cloud_available if (self._mode in ("cloud", "auto")) else False

        if not local_ok and not cloud_ok:
            return {
                "success": False,
                "enabled": False,
                "message": "No LLM backend available. Start 'opencode serve' or set DEEPSEEK_API_KEY.",
                "data": None,
            }

        prompt = self._build_verification_prompt(ocr_text, doc_type)

        if local_ok:
            result = self._call_opencode(prompt)
            if result["success"]:
                return result
            logger.warning("OpenCode LLM failed, falling back to cloud: %s", result.get("message"))

        if cloud_ok:
            result = self._call_cloud(prompt)
            if result["success"]:
                return result

        return {
            "success": False,
            "enabled": True,
            "message": "All LLM backends failed",
            "data": None,
        }

    def _call_opencode(self, prompt: str) -> dict:
        try:
            with httpx.Client(timeout=OPENCODE_TIMEOUT) as client:
                session_resp = client.post(f"{OPENCODE_SERVER_URL}/session", json={})
                session_resp.raise_for_status()
                session_id = session_resp.json()["id"]

                msg_resp = client.post(
                    f"{OPENCODE_SERVER_URL}/session/{session_id}/message",
                    json={
                        "model": self._opencode_model,
                        "parts": [{"type": "text", "text": prompt}],
                    },
                )
                msg_resp.raise_for_status()
                body = msg_resp.json()

            parts = body.get("parts", [])
            text = ""
            for p in parts:
                if p.get("type") == "text":
                    text = p.get("text", "")
                    break

            if not text:
                return {"success": False, "enabled": True, "message": "No text in OpenCode response", "data": None}

            parsed = self._parse_json(text)
            return {
                "success": True,
                "enabled": True,
                "mode": "local",
                "model": OPENCODE_MODEL_NAME,
                "data": parsed,
            }
        except httpx.TimeoutException:
            logger.error("OpenCode request timed out")
            return {"success": False, "enabled": True, "message": "OpenCode request timed out", "data": None}
        except Exception as e:
            logger.error("OpenCode error: %s", e)
            return {"success": False, "enabled": True, "message": f"OpenCode error: {str(e)}", "data": None}

    def _call_cloud(self, prompt: str) -> dict:
        try:
            with httpx.Client(timeout=CLOUD_TIMEOUT) as client:
                resp = client.post(
                    DEEPSEEK_API_URL,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": CLOUD_MODEL,
                        "messages": [
                            {"role": "system", "content": "You are a precise OCR verification assistant. Return only valid JSON."},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 1024,
                    },
                )
                resp.raise_for_status()
                body = resp.json()

            raw = body["choices"][0]["message"]["content"]
            parsed = self._parse_json(raw)

            return {
                "success": True,
                "enabled": True,
                "mode": "cloud",
                "model": CLOUD_MODEL,
                "data": parsed,
            }
        except httpx.TimeoutException:
            logger.error("DeepSeek API timeout")
            return {"success": False, "enabled": True, "message": "Cloud LLM request timed out", "data": None}
        except Exception as e:
            logger.error("DeepSeek API error: %s", e)
            return {"success": False, "enabled": True, "message": f"Cloud LLM error: {str(e)}", "data": None}

    @staticmethod
    def _parse_json(raw: str) -> dict | None:
        depth = 0
        start = -1
        for i, ch in enumerate(raw):
            if ch == "{":
                if start == -1:
                    start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start != -1:
                    return json.loads(raw[start:i+1])
        return json.loads(raw)
