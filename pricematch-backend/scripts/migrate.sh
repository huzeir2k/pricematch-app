#!/usr/bin/env bash
#
# Database Migration Script
# Automatically runs all migrations in the migrations/ folder
# 
# Usage: ./scripts/migrate.sh

set -e  # Exit on first error

echo "=========================================="
echo "PriceMatch Database Migration Runner"
echo "=========================================="

cd "$(dirname "$0")/../"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

# Load environment variables from .env if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✓ Environment variables loaded from .env"
else
    echo "⚠️  No .env file found, using environment variables"
fi

# Run migrations
echo ""
echo "Running migrations..."
node migrations/001-create-indexes.js

echo ""
node migrations/002-ttl-indexes.js

echo ""
echo "=========================================="
echo "✅ All migrations completed successfully!"
echo "=========================================="
