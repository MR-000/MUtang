Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param (
        [string]$SourcePath,
        [string]$TargetPath,
        [int]$Width,
        [int]$Height
    )
    $srcImg = [System.Drawing.Image]::FromFile($SourcePath)
    $destImg = New-Object System.Drawing.Bitmap($Width, $Height)
    $graphic = [System.Drawing.Graphics]::FromImage($destImg)
    $graphic.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphic.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphic.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphic.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphic.DrawImage($srcImg, 0, 0, $Width, $Height)
    $destImg.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphic.Dispose()
    $destImg.Dispose()
    $srcImg.Dispose()
}

Resize-Image -SourcePath "d:\MT\utang\DOC\android.png" -TargetPath "d:\MT\utang\public\android-192.png" -Width 192 -Height 192
Resize-Image -SourcePath "d:\MT\utang\DOC\android.png" -TargetPath "d:\MT\utang\public\android-512.png" -Width 512 -Height 512
Resize-Image -SourcePath "d:\MT\utang\DOC\IOS.png" -TargetPath "d:\MT\utang\public\apple-touch-icon.png" -Width 180 -Height 180

Write-Host "Resizing complete!"
