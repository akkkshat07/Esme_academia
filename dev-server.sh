#!/bin/bash

# LMS Development Server Manager
# Quick start/stop scripts for local development

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_PID_FILE="$PROJECT_DIR/.backend.pid"
FRONTEND_PID_FILE="$PROJECT_DIR/.frontend.pid"
ADMIN_PID_FILE="$PROJECT_DIR/.admin.pid"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to start backend
start_backend() {
    echo -e "${BLUE}Starting Backend Server...${NC}"
    
    if [ -f "$BACKEND_PID_FILE" ]; then
        OLD_PID=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo -e "${YELLOW}Backend already running (PID: $OLD_PID)${NC}"
            return 0
        fi
    fi
    
    cd "$PROJECT_DIR"
    npm start > server.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > "$BACKEND_PID_FILE"
    
    sleep 2
    
    # Check if server is running
    # Try up to 5 times
    for i in {1..5}; do
        if curl -s http://localhost:3001/api/health > /dev/null; then
            echo -e "${GREEN}✓ Backend running on http://localhost:3001${NC}"
            return 0
        fi
        sleep 1
    done
    
    echo -e "${RED}✗ Backend failed to start${NC}"
    tail -20 server.log
    return 1
}

# Function to start admin server
start_admin() {
    echo -e "${BLUE}Starting Admin/AI Server...${NC}"
    
    if [ -f "$ADMIN_PID_FILE" ]; then
        OLD_PID=$(cat "$ADMIN_PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo -e "${YELLOW}Admin server already running (PID: $OLD_PID)${NC}"
            return 0
        fi
    fi
    
    cd "$PROJECT_DIR/admin-server"
    # Ensure logs directory or write to main project log
    npm start > "$PROJECT_DIR/admin.log" 2>&1 &
    ADMIN_PID=$!
    echo $ADMIN_PID > "$ADMIN_PID_FILE"
    cd "$PROJECT_DIR"
    
    sleep 2
    
    # Check if server is running (port 3002)
    if curl -s http://localhost:3002/health > /dev/null; then
        echo -e "${GREEN}✓ Admin/AI running on http://localhost:3002${NC}"
        return 0
    else
        echo -e "${RED}✗ Admin/AI failed to start${NC}"
        tail -20 "$PROJECT_DIR/admin.log"
        return 1
    fi
}


# Function to start frontend
start_frontend() {
    echo -e "${BLUE}Starting Frontend Server...${NC}"
    
    if [ -f "$FRONTEND_PID_FILE" ]; then
        OLD_PID=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo -e "${YELLOW}Frontend already running (PID: $OLD_PID)${NC}"
            return 0
        fi
    fi
    
    cd "$PROJECT_DIR"
    node frontend-server.js > frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$FRONTEND_PID_FILE"
    
    sleep 1
    
    # Check if server is running
    if curl -s http://localhost:3000 > /dev/null; then
        echo -e "${GREEN}✓ Frontend running on http://localhost:3000${NC}"
        return 0
    else
        echo -e "${RED}✗ Frontend failed to start${NC}"
        tail -20 frontend.log
        return 1
    fi
}

# Function to stop servers
stop_servers() {
    echo -e "${BLUE}Stopping servers...${NC}"
    
    if [ -f "$BACKEND_PID_FILE" ]; then
        BACKEND_PID=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$BACKEND_PID" 2>/dev/null; then
            kill "$BACKEND_PID"
            echo -e "${GREEN}✓ Backend stopped (PID: $BACKEND_PID)${NC}"
        fi
        rm -f "$BACKEND_PID_FILE"
    fi

    if [ -f "$ADMIN_PID_FILE" ]; then
        ADMIN_PID=$(cat "$ADMIN_PID_FILE")
        if kill -0 "$ADMIN_PID" 2>/dev/null; then
            kill "$ADMIN_PID"
            echo -e "${GREEN}✓ Admin/AI stopped (PID: $ADMIN_PID)${NC}"
        fi
        rm -f "$ADMIN_PID_FILE"
    fi
    
    if [ -f "$FRONTEND_PID_FILE" ]; then
        FRONTEND_PID=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$FRONTEND_PID" 2>/dev/null; then
            kill "$FRONTEND_PID"
            echo -e "${GREEN}✓ Frontend stopped (PID: $FRONTEND_PID)${NC}"
        fi
        rm -f "$FRONTEND_PID_FILE"
    fi
}


# Function to show status
show_status() {
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo -e "${BLUE}  LMS Development Server Status${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    
    echo ""
    echo -e "${YELLOW}Frontend:${NC}"
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Running on http://localhost:3000${NC}"
    else
        echo -e "${RED}✗ Not running${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}Backend API:${NC}"
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Running on http://localhost:3001${NC}"
        echo "  $(curl -s http://localhost:3001/api/health | jq -r '.time')"
    else
        echo -e "${RED}✗ Not running${NC}"
    fi

    echo ""
    echo -e "${YELLOW}Admin/AI API:${NC}"
    if curl -s http://localhost:3002/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Running on http://localhost:3002${NC}"
    else
        echo -e "${RED}✗ Not running${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}Logs:${NC}"
    [ -f server.log ] && echo "  Backend: $(tail -1 server.log)"
    [ -f admin.log ] && echo "  Admin:   $(tail -1 admin.log)"
    [ -f frontend.log ] && echo "  Frontend: Last update $(stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' frontend.log)"
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
}


# Function to show logs
show_logs() {
    case "$1" in
        backend)
            tail -f server.log
            ;;
        frontend)
            tail -f frontend.log
            ;;
        *)
            echo "Usage: $0 logs [backend|frontend]"
            ;;
    esac
}

# Main script logic
case "$1" in
    start)
        start_backend && start_admin && start_frontend
        show_status
        ;;
    stop)
        stop_servers
        ;;
    restart)
        stop_servers
        sleep 1
        start_backend && start_admin && start_frontend
        show_status
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$2"
        ;;
    *)
        echo "LMS Development Server Manager"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start    - Start both frontend and backend servers"
        echo "  stop     - Stop both servers"
        echo "  restart  - Restart both servers"
        echo "  status   - Show server status"
        echo "  logs     - Show logs (usage: logs [backend|frontend])"
        echo ""
        echo "Examples:"
        echo "  $0 start"
        echo "  $0 status"
        echo "  $0 logs backend"
        ;;
esac
