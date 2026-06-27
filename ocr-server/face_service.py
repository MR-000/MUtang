import io
import os
import logging

import numpy as np
from PIL import Image

logger = logging.getLogger("mutang-ocr.face_service")


class FaceService:
    def __init__(self):
        self._model = None
        self._cosine_threshold = 0.42
        self._loaded = False
        self._load_model()

    def _load_model(self):
        try:
            from insightface.app import FaceAnalysis
            self._model = FaceAnalysis(
                name="buffalo_sc",
                root=os.path.expanduser("~/.insightface"),
                providers=["CPUExecutionProvider"],
            )
            self._model.prepare(ctx_id=-1, det_size=(640, 640))
            self._loaded = True
            logger.info("InsightFace buffalo_sc model loaded successfully")
        except Exception as e:
            logger.warning("InsightFace load failed, using fallback: %s", e)
            self._loaded = False

    def _extract_embedding(self, image_bytes: bytes):
        img = self._load_image(image_bytes)
        faces = self._model.get(img)
        if not faces or len(faces) == 0:
            return None, "no_face_detected"
        if len(faces) > 1:
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        else:
            face = faces[0]
        return face.normed_embedding, None

    def verify(self, id_image_bytes: bytes, selfie_image_bytes: bytes) -> dict:
        if not self._loaded:
            return {
                "success": False,
                "match": None,
                "confidence": 0,
                "message": "얼굴 인증 서비스가 로드되지 않았습니다. 서버 로그를 확인하세요.",
            }

        try:
            emb1, err1 = self._extract_embedding(id_image_bytes)
            if err1:
                return {
                    "success": False,
                    "match": None,
                    "confidence": 0,
                    "message": "신분증 사진에서 얼굴을 감지할 수 없습니다.",
                }

            emb2, err2 = self._extract_embedding(selfie_image_bytes)
            if err2:
                return {
                    "success": False,
                    "match": None,
                    "confidence": 0,
                    "message": "셀피 사진에서 얼굴을 감지할 수 없습니다.",
                }

            similarity = float(np.dot(emb1, emb2))
            similarity = max(-1.0, min(1.0, similarity))
            match = similarity >= self._cosine_threshold

            return {
                "success": True,
                "match": match,
                "confidence": round(similarity, 4),
                "message": "동일인 확인 성공" if match else "동일인이 아닐 가능성이 높습니다",
            }
        except Exception as e:
            logger.error("Face verification error: %s", e)
            return {
                "success": False,
                "match": None,
                "confidence": 0,
                "message": f"얼굴 인증 중 오류가 발생했습니다: {str(e)}",
            }

    def _load_image(self, image_bytes: bytes) -> np.ndarray:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return np.array(pil_image)
