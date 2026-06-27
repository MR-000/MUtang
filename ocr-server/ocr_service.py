import io
import re
import logging

import numpy as np
from PIL import Image
from paddleocr import PaddleOCR

logger = logging.getLogger("mutang-ocr.ocr_service")


class OcrService:
    def __init__(self):
        self._ocr = PaddleOCR(
            ocr_version="PP-OCRv6",
            use_textline_orientation=True,
            lang="en",
        )

    def recognize(self, image_bytes: bytes) -> dict:
        img = self._load_image(image_bytes)
        results = list(self._ocr.predict(img))
        lines = []
        full_text = ""

        for page in results:
            texts = self._get_field(page, ("txts", "rec_texts"))
            scores = self._get_field(page, ("scores", "rec_scores"))
            boxes = self._get_field(page, ("boxes", "rec_boxes"))

            if texts is None:
                continue

            for i in range(len(texts)):
                text = str(texts[i]) if texts[i] is not None else ""
                confidence = round(float(scores[i]), 4) if scores is not None and i < len(scores) and scores[i] is not None else 0.0
                bbox = self._extract_bbox(boxes, i)

                lines.append({
                    "text": text,
                    "confidence": confidence,
                    "bbox": bbox,
                })
                full_text += text + "\n"

        return {
            "success": True,
            "ocr_engine": "PP-OCRv6 Medium",
            "text": full_text.strip(),
            "lines": lines,
            "line_count": len(lines),
        }

    def recognize_receipt(self, image_bytes: bytes, expected_amount: str) -> dict:
        ocr_result = self.recognize(image_bytes)
        full_text = ocr_result.get("text", "")

        normalized = full_text.lower()
        parsed_ref_no = ""
        amount_matches = False

        ref_match = re.search(
            r"(?:ref(?:\.?\s*no\.?|erence)?|trans(?:\.?\s*no\.?)?)\s*:?\s*([0-9\s-]{11,17})",
            full_text, re.IGNORECASE,
        )
        if ref_match:
            parsed_ref_no = re.sub(r"[\s-]", "", ref_match.group(1))
        else:
            backup = re.search(r"\b\d{11,13}\b", full_text)
            if backup:
                parsed_ref_no = backup.group(0)

        if expected_amount:
            amount_matches = expected_amount in normalized or str(float(expected_amount)) in normalized

        return {
            "success": True,
            "ocr_engine": "PP-OCRv6 Medium",
            "text": full_text.strip(),
            "parsed_ref_no": parsed_ref_no,
            "amount_matches": amount_matches,
        }

    def _load_image(self, image_bytes: bytes) -> np.ndarray:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return np.array(pil_image)

    @staticmethod
    def _get_field(page, keys: tuple):
        """Safely get a field from a result, handling dict keys and object attributes."""
        for key in keys:
            if isinstance(page, dict):
                val = page.get(key)
            else:
                val = getattr(page, key, None)
            if val is not None:
                return val
        return None

    @staticmethod
    def _extract_bbox(boxes, idx: int) -> list:
        """Safely extract a bbox from boxes array at the given index."""
        try:
            if boxes is None or idx >= len(boxes):
                return []
            box = boxes[idx]
            if box is None:
                return []
            if hasattr(box, "tolist"):
                arr = box.tolist()
            elif isinstance(box, (list, tuple)):
                arr = box
            else:
                return []
            if not arr or len(arr) == 0:
                return []
            first = arr[0]
            if isinstance(first, (int, float)):
                n = len(arr)
                if n == 4:
                    return [[float(arr[0]), float(arr[1])], [float(arr[2]), float(arr[1])], [float(arr[2]), float(arr[3])], [float(arr[0]), float(arr[3])]]
                if n == 8:
                    return [[float(arr[i]), float(arr[i+1])] for i in range(0, 8, 2)]
                return []
            result = []
            for pt in arr:
                if isinstance(pt, (int, float)):
                    continue
                if isinstance(pt, (list, tuple)):
                    result.append([float(v) for v in pt])
            return result
        except Exception:
            return []
