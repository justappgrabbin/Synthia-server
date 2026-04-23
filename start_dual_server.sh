#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  SYNTHIA DUAL-SERVER STARTUP
#  Launches both Paper Worlds (Node.js) and Synthia (Python) with monitoring
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PYTHON_PORT=${PYTHON_PORT:-10000}
NODE_PORT=${NODE_PORT:-3002}
PYTHON_DIR=${PYTHON_DIR:-"./Synthia-server"}
NODE_DIR=${NODE_DIR:-"./paper-worlds-server"}
HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-30}
MAX_RESTARTS=${MAX_RESTARTS:-5}

# State tracking
PYTHON_PID=""
NODE_PID=""
PYTHON_RESTARTS=0
NODE_RESTARTS=0

# Logging
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Health check function
check_health() {
    local url=$1
    local name=$2
    local timeout=${3:-5}

    if curl -sf "$url" --max-time "$timeout" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Start Python server
start_python() {
    if [ $PYTHON_RESTARTS -ge $MAX_RESTARTS ]; then
        error "Python server exceeded max restarts ($MAX_RESTARTS). Giving up."
        return 1
    fi

    log "Starting Python Synthia server..."
    cd "$PYTHON_DIR"

    # Check if Python dependencies are installed
    if ! python -c "import fastapi" 2>/dev/null; then
        warn "Python dependencies missing. Installing..."
        pip install -r requirements.txt --break-system-packages 2>/dev/null || pip install -r requirements.txt
    fi

    # Start server in background
    python server.py &
    PYTHON_PID=$!
    cd - >/dev/null

    # Wait for server to be ready
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if check_health "http://localhost:$PYTHON_PORT/api/consciousness/status" "Python" 2; then
            success "Python server ready on port $PYTHON_PORT (PID: $PYTHON_PID)"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))
    done

    warn "Python server failed health check after 30s. Restarting..."
    kill $PYTHON_PID 2>/dev/null || true
    PYTHON_RESTARTS=$((PYTHON_RESTARTS + 1))
    sleep 2
    start_python
}

# Start Node.js server
start_node() {
    if [ $NODE_RESTARTS -ge $MAX_RESTARTS ]; then
        error "Node.js server exceeded max restarts ($MAX_RESTARTS). Giving up."
        return 1
    fi

    log "Starting Node.js Paper Worlds server..."
    cd "$NODE_DIR"

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        warn "Node.js dependencies missing. Installing..."
        npm install
    fi

    # Build TypeScript if needed
    if [ -f "tsconfig.json" ] && [ ! -d "dist" ]; then
        log "Building TypeScript..."
        npm run build
    fi

    # Start server in background
    npm start &
    NODE_PID=$!
    cd - >/dev/null

    # Wait for server to be ready
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if check_health "http://localhost:$NODE_PORT/health" "Node.js" 2; then
            success "Node.js server ready on port $NODE_PORT (PID: $NODE_PID)"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))
    done

    warn "Node.js server failed health check after 30s. Restarting..."
    kill $NODE_PID 2>/dev/null || true
    NODE_RESTARTS=$((NODE_RESTARTS + 1))
    sleep 2
    start_node
}

# Monitor and restart function
monitor() {
    log "Starting health monitor (interval: ${HEALTH_CHECK_INTERVAL}s)"

    while true; do
        sleep "$HEALTH_CHECK_INTERVAL"

        # Check Python
        if ! check_health "http://localhost:$PYTHON_PORT/api/consciousness/status" "Python" 5; then
            warn "Python server unhealthy! Restarting..."
            kill $PYTHON_PID 2>/dev/null || true
            sleep 2
            start_python
        fi

        # Check Node.js
        if ! check_health "http://localhost:$NODE_PORT/health" "Node.js" 5; then
            warn "Node.js server unhealthy! Restarting..."
            kill $NODE_PID 2>/dev/null || true
            sleep 2
            start_node
        fi

        # Check bridge connection
        if ! check_health "http://localhost:$NODE_PORT/api/synthia/status" "Bridge" 5; then
            warn "Bridge connection failing! Check SYNTHIA_URL in .env"
        fi
    done
}

# Cleanup on exit
cleanup() {
    log "Shutting down servers..."
    [ -n "$PYTHON_PID" ] && kill $PYTHON_PID 2>/dev/null || true
    [ -n "$NODE_PID" ] && kill $NODE_PID 2>/dev/null || true
    log "Servers stopped."
    exit 0
}

trap cleanup INT TERM EXIT

# Main
main() {
    log "═══════════════════════════════════════════════════════════════"
    log "  SYNTHIA DUAL-SERVER STARTUP"
    log "  Python: http://localhost:$PYTHON_PORT"
    log "  Node.js: http://localhost:$NODE_PORT"
    log "═══════════════════════════════════════════════════════════════"

    # Check prerequisites
    if ! command_exists python; then
        error "Python not found. Please install Python 3.10+"
        exit 1
    fi

    if ! command_exists node; then
        error "Node.js not found. Please install Node.js 18+"
        exit 1
    fi

    if ! command_exists curl; then
        error "curl not found. Please install curl"
        exit 1
    fi

    # Check directories
    if [ ! -d "$PYTHON_DIR" ]; then
        error "Python directory not found: $PYTHON_DIR"
        exit 1
    fi

    if [ ! -d "$NODE_DIR" ]; then
        error "Node.js directory not found: $NODE_DIR"
        exit 1
    fi

    # Start servers
    start_python
    start_node

    # Test bridge
    log "Testing bridge connection..."
    sleep 3
    if check_health "http://localhost:$NODE_PORT/api/synthia/status" "Bridge" 10; then
        success "Bridge connection established!"
    else
        warn "Bridge test failed. Servers may need more time to initialize."
    fi

    # Start monitoring
    log "All systems operational. Press Ctrl+C to stop."
    monitor
}

# Run main
main "$@"
