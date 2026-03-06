$ErrorActionPreference = "Stop"

Write-Host "Building EchoSpark..."

# Install dependencies
Write-Host "Installing dependencies..."
pnpm install

# Build the project
Write-Host "Running build..."
pnpm build

Write-Host "EchoSpark build complete."
