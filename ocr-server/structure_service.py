import io
import logging

import numpy as np
from PIL import Image
from paddleocr import PPStructureV3

logger = logging.getLogger("mutang-ocr.structure_service")


class StructureService:
    def __init__(self):
        self._engine = PPStructureV3(
            use_table_recognition=True,
            use_doc_orientation_classify=True,
            lang="en",
        )

    def analyze(self, image_bytes: bytes) -> dict:
        img = self._load_image(image_bytes)
        results = list(self._engine.predict(img))
        elements = []

        for page in results:
            if page is None:
                continue
            blocks = self._get_blocks(page)
            if not blocks:
                blocks = [page]
            for block in blocks:
                bbox = self._extract_bbox(block)
                res = self._get_field(block, "res", {})
                res_text = self._get_field(res, "text", "") if isinstance(res, dict) else str(res) if res else ""
                elements.append({
                    "type": self._get_field(block, "type", "unknown"),
                    "bbox": bbox,
                    "confidence": round(float(self._get_field(block, "confidence", 0)), 4),
                    "text": self._get_field(block, "text", res_text),
                })

        return {
            "success": True,
            "engine": "PP-StructureV3",
            "element_count": len(elements),
            "elements": elements,
        }

    def _load_image(self, image_bytes: bytes) -> np.ndarray:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return np.array(pil_image)

    @staticmethod
    def _get_blocks(page) -> list:
        """Extract blocks from a page, handling dict keys and object attributes."""
        for key in ("blocks", "block_info"):
            if isinstance(page, dict):
                blocks = page.get(key)
            else:
                blocks = getattr(page, key, None)
            if blocks is not None:
                return blocks
        return []

    @staticmethod
    def _get_field(block, key: str, default=None):
        """Safely get a field from a block, handling dict keys and object attributes."""
        if isinstance(block, dict):
            return block.get(key, default)
        return getattr(block, key, default)

    @staticmethod
    def _extract_bbox(block) -> list:
        """Safely extract bbox from a block, handling numpy arrays and flat formats."""
        bbox = StructureService._get_field(block, "bbox")
        if bbox is None:
            return []
        if hasattr(bbox, "tolist"):
            bbox = bbox.tolist()
        if not isinstance(bbox, (list, tuple)) or len(bbox) == 0:
            return []
        first = bbox[0]
        if isinstance(first, (int, float)):
            n = len(bbox)
            if n == 4:
                return [[float(bbox[0]), float(bbox[1])], [float(bbox[2]), float(bbox[1])], [float(bbox[2]), float(bbox[3])], [float(bbox[0]), float(bbox[3])]]
            if n == 8:
                return [[float(bbox[i]), float(bbox[i+1])] for i in range(0, 8, 2)]
            return []
        return [[float(v) for v in pt] for pt in bbox]
