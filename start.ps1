# Start script for EchoSpark (Frontend)
# This script serves the built 'dist' folder using 'serve'

$ErrorActionPreference = "Stop"

# Check if dist exists
if (-not (Test-Path "dist")) {
    Write-Error "Error: 'dist' directory not found. Please run build.ps1 first."
    exit 1
}

Write-Host "Starting EchoSpark Frontend Server..."
Write-Host "Serving 'dist' on port 5173 (default for Vite preview) or custom port..."

# Use npx serve to serve the static files
# -s: Single-Page Application mode (rewrites 404s to index.html)
# -l: Listen on port
npx serve -s dist -l 5173

# Alternatively, use vite preview:
# pnpm preview
