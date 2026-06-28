$modelsDir = "public/models"
if (!(Test-Path $modelsDir)) {
    New-Item -ItemType Directory -Force -Path $modelsDir
}

Write-Host "Downloading PP-OCRv6 Small Det Model..."
curl.exe -L -o "$modelsDir/ch_PP-OCRv6_det_infer.onnx" "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx/resolve/main/inference.onnx"

Write-Host "Downloading PP-OCRv6 Medium Rec Model..."
curl.exe -L -o "$modelsDir/ch_PP-OCRv6_rec_infer.onnx" "https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx/resolve/main/inference.onnx"

Write-Host "Downloading PP-OCR Character Keys..."
curl.exe -L -o "$modelsDir/ppocr_keys_v1.txt" "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/ppocr_keys_v1.txt"

if (!(Test-Path "$modelsDir/det_500m.onnx") -or (Get-Item "$modelsDir/det_500m.onnx").Length -lt 10000) {
    Write-Host "Downloading InsightFace Det Model (det_500m)..."
    curl.exe -L -o "$modelsDir/det_500m.onnx" "https://huggingface.co/WePrompt/buffalo_sc/resolve/main/det_500m.onnx"
} else {
    Write-Host "InsightFace Det Model already exists, skipping."
}

if (!(Test-Path "$modelsDir/w600k_mbf.onnx") -or (Get-Item "$modelsDir/w600k_mbf.onnx").Length -lt 10000) {
    Write-Host "Downloading InsightFace Embedding Model (w600k_mbf)..."
    curl.exe -L -o "$modelsDir/w600k_mbf.onnx" "https://huggingface.co/WePrompt/buffalo_sc/resolve/main/w600k_mbf.onnx"
} else {
    Write-Host "InsightFace Embedding Model already exists, skipping."
}

Write-Host "Model downloads completed!"
