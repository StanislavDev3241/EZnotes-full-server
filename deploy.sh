#!/bin/bash

# ClearlyAI Deployment Script
# This script deploys the ClearlyAI application using Docker Compose

set -e  # Exit on any error

echo "🚀 ClearlyAI Deployment Script"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    if [ -f .env.example ]; then
        cp .env.example .env
        print_status "Created .env file from template. Please edit it with your configuration."
        print_warning "You need to set OPENAI_API_KEY and JWT_SECRET before continuing."
        exit 1
    else
        print_error ".env.example not found. Please create a .env file manually."
        exit 1
    fi
fi

# Check required environment variables
source .env
if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    print_error "OPENAI_API_KEY not set in .env file"
    exit 1
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your_jwt_secret_here" ]; then
    print_error "JWT_SECRET not set in .env file"
    exit 1
fi

print_status "Environment configuration verified"

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p uploads temp logs
chmod 755 uploads temp logs

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down --remove-orphans

# Build and start services
print_status "Building and starting services..."
docker-compose up -d --build

# Wait for services to start
print_status "Waiting for services to start..."
sleep 10

# Check service health
print_status "Checking service health..."

# Check backend health
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    print_status "✅ Backend is healthy"
else
    print_error "❌ Backend health check failed"
    docker-compose logs backend
    exit 1
fi

# Check frontend
if curl -f http://localhost > /dev/null 2>&1; then
    print_status "✅ Frontend is accessible"
else
    print_warning "⚠️ Frontend health check failed (this might be normal during startup)"
fi

# Check database
if docker exec clearlyai-unified-postgres-1 pg_isready -U clearlyAI > /dev/null 2>&1; then
    print_status "✅ Database is ready"
else
    print_error "❌ Database health check failed"
    docker-compose logs postgres
    exit 1
fi

# Check Redis
if docker exec clearlyai-unified-redis-1 redis-cli ping > /dev/null 2>&1; then
    print_status "✅ Redis is ready"
else
    print_error "❌ Redis health check failed"
    docker-compose logs redis
    exit 1
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo "================================"
echo "📱 Frontend: http://localhost"
echo "🔧 Backend API: http://localhost:3001"
echo "📊 Health Check: http://localhost:3001/health"
echo ""
echo "📋 Useful commands:"
echo "  View logs: docker-compose logs -f"
echo "  Stop services: docker-compose down"
echo "  Restart services: docker-compose restart"
echo "  Check status: docker-compose ps"
echo ""
echo "🔍 For troubleshooting, check the DEPLOYMENT.md file" 