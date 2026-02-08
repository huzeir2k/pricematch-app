#!/bin/bash

# PriceMatch Backend Startup Script
# Simple version with clear error reporting

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "================================"
echo "PriceMatch Backend Startup"
echo "================================"
echo ""

# Function to check and report errors
check() {
    if [ $? -ne 0 ]; then
        echo ""
        echo "========================================"
        echo -e "${RED}ERROR: $1${NC}"
        echo "========================================"
        exit 1
    fi
}

# 1. Check Node.js
echo "1. Checking Node.js..."
node --version > /dev/null 2>&1
check "Node.js not installed. Install from https://nodejs.org"
echo -e "${GREEN}✓ Node.js $(node --version)${NC}"

# 2. Check npm
echo "2. Checking npm..."
npm --version > /dev/null 2>&1
check "npm not installed"
echo -e "${GREEN}✓ npm $(npm --version)${NC}"

# 3. Check package.json
echo "3. Checking package.json..."
[ -f "package.json" ]
check "package.json not found. Run from pricematch-backend directory."
echo -e "${GREEN}✓ package.json found${NC}"

# 4. Check/install node_modules
echo "4. Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   Installing npm packages..."
    npm install
    check "npm install failed"
fi
echo -e "${GREEN}✓ Dependencies ready${NC}"

# 5. Check .env exists
echo "5. Checking .env..."
if [ ! -f ".env" ]; then
    echo "   Creating .env from .env.example..."
    cp .env.example .env
    check ".env.example not found"
    echo -e "${YELLOW}⚠ Created .env - please configure it!${NC}"
fi
echo -e "${GREEN}✓ .env found${NC}"

# 6. Check .env has required values
echo "6. Validating .env values..."

# Proper .env loader that handles spaces and quotes
set -a
source .env
set +a

if [ -z "$MONGODB_URI" ]; then
    echo ""
    echo "========================================"
    echo -e "${RED}ERROR: MONGODB_URI not set in .env${NC}"
    echo "========================================"
    echo ""
    echo "Edit .env and add:"
    echo "MONGODB_URI=mongodb://localhost:27017/pricematch"
    echo ""
    exit 1
fi

if [ -z "$JWT_SECRET" ]; then
    echo ""
    echo "========================================"
    echo -e "${RED}ERROR: JWT_SECRET not set in .env${NC}"
    echo "========================================"
    echo ""
    echo "Edit .env and add:"
    echo "JWT_SECRET=your_secret_key_here_min_32_chars"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ MONGODB_URI configured${NC}"
echo -e "${GREEN}✓ JWT_SECRET configured${NC}"

# 7. Check src/index.js
echo "7. Checking entry point..."
[ -f "src/index.js" ]
check "src/index.js not found"
echo -e "${GREEN}✓ src/index.js found${NC}"

# 8. Check MongoDB
echo "8. Checking MongoDB..."
if command -v mongosh &> /dev/null; then
    if timeout 3 mongosh "$MONGODB_URI" --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ MongoDB is accessible${NC}"
    else
        echo -e "${YELLOW}⚠ MongoDB not responding at $MONGODB_URI${NC}"
        echo "   Make sure MongoDB is running:"
        echo "   • brew services start mongodb-community (macOS)"
        echo "   • sudo systemctl start mongod (Linux)"
        echo "   • docker run -d -p 27017:27017 mongo:latest (Docker)"
    fi
else
    echo -e "${YELLOW}⚠ mongosh not found, skipping MongoDB check${NC}"
    echo "   Ensure MongoDB is running at: $MONGODB_URI"
fi

# 9. Check port
echo "9. Checking port..."
PORT=${PORT:-5000}
if command -v lsof &> /dev/null; then
    if ! lsof -Pi :$PORT -sTCP:LISTEN -t > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Port $PORT is available${NC}"
    else
        echo -e "${RED}✗ Port $PORT is already in use${NC}"
        echo "   Change PORT in .env or kill the process:"
        echo "   lsof -ti:$PORT | xargs kill -9"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ lsof not found, skipping port check${NC}"
fi

# Ready to start
echo ""
echo "================================"
echo "Starting Backend Server"
echo "================================"
echo -e "Server: ${BLUE}http://localhost:${PORT}${NC}"
echo -e "Database: ${BLUE}$MONGODB_URI${NC}"
echo -e "Environment: ${BLUE}${NODE_ENV:-development}${NC}"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start
if [ "${NODE_ENV}" = "production" ]; then
    node --experimental-fetch src/index.js
else
    node --experimental-fetch ./node_modules/.bin/nodemon src/index.js
fi
