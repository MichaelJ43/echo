# Crops docs/logo-source.png to a centered square and writes 1024×1024 PNGs for Tauri + Vite.
param(
  [string]$InputPath = "docs/logo-source.png",
  [string]$RootLogo = "logo.png",
  [string]$PublicLogo = "public/logo.png",
  [int]$Size = 1024
)
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$in = Join-Path $repoRoot $InputPath
if (-not (Test-Path $in)) { throw "Missing $in" }

$publicDir = Split-Path (Join-Path $repoRoot $PublicLogo) -Parent
if (-not (Test-Path $publicDir)) { New-Item -ItemType Directory -Path $publicDir -Force | Out-Null }

Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($in)
$bmp = $null
try {
  $w = $img.Width
  $h = $img.Height
  $side = [Math]::Min($w, $h)
  $x = [int](($w - $side) / 2)
  $y = [int](($h - $side) / 2)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $srcRect = New-Object System.Drawing.Rectangle -ArgumentList $x, $y, $side, $side
    $destRect = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $Size, $Size
    $g.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  } finally {
    $g.Dispose()
  }
  $outRoot = Join-Path $repoRoot $RootLogo
  $outPublic = Join-Path $repoRoot $PublicLogo
  $bmp.Save($outRoot, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "Wrote $outRoot (${Size}x${Size})"

  $webSize = 256
  $bmpWeb = New-Object System.Drawing.Bitmap($webSize, $webSize)
  $gw = [System.Drawing.Graphics]::FromImage($bmpWeb)
  try {
    $gw.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gw.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $srcAll = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $Size, $Size
    $destWeb = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $webSize, $webSize
    $gw.DrawImage($bmp, $destWeb, $srcAll, [System.Drawing.GraphicsUnit]::Pixel)
  } finally {
    $gw.Dispose()
  }
  try {
    $bmpWeb.Save($outPublic, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Wrote $outPublic (${webSize}x${webSize} for web UI + favicon)"
  } finally {
    $bmpWeb.Dispose()
  }
} finally {
  $img.Dispose()
  if ($bmp) { $bmp.Dispose() }
}
