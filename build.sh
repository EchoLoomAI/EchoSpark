#!/bin/bash

# Exit on error
set -e

echo "Building EchoSpark..."

# Install dependencies if needed (assuming pnpm is used globally or in workspace)
# Since EchoSpark is a workspace member (presumably), pnpm install at root should cover it, 
# but running it here ensures local deps are ready.
echo "Installing dependencies..."
pnpm install

# Build the project
echo "Running build..."
pnpm build

echo "EchoSpark build complete."
