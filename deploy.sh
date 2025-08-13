#!/bin/bash

# ClearlyAI Unified Deployment Script
# This script deploys the complete full-stack application

set -e

echo "🚀 Starting ClearlyAI Unified Deployment..."

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Please run this script from the clearlyai-unified directory"
    exit 1
fi

# Check if required directories exist
if [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    echo "❌ Error: Frontend or backend directory not found"
    echo "   Expected structure:"
    echo "   clearlyai-unified/"
    echo "   ├── frontend/"
    echo "   ├── backend/"
    echo "   └── docker-compose.yml"
    exit 1
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p uploads temp logs

# Stop any existing containers
echo "🔄 Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Remove old images to ensure fresh build
echo "🧹 Cleaning up old images..."
docker image prune -f

# Build and start the full stack
echo "🔨 Building and starting full stack..."
docker-compose up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service status
echo "🔍 Checking service status..."
docker-compose ps

# Test the services
echo "🧪 Testing services..."

# Test frontend (served by Node.js, no Nginx required)
echo "   Testing frontend..."
if curl -s http://localhost > /dev/null; then
    echo "   ✅ Frontend is running on http://localhost (Node.js serve)"
else
    echo "   ❌ Frontend is not responding"
fi

# Test backend
echo "   Testing backend..."
if curl -s http://localhost:3001/health > /dev/null; then
    echo "   ✅ Backend is running on http://localhost:3001"
else
    echo "   ❌ Backend is not responding"
fi

# Test database connection
echo "   Testing database..."
if docker-compose exec -T postgres pg_isready -U clearlyAI -d clearlyai_db > /dev/null 2>&1; then
    echo "   ✅ Database is ready"
else
    echo "   ❌ Database is not ready"
fi

echo ""
echo "✅ Deployment completed!"
echo ""
echo "🌐 Access your application:"
echo "   Frontend: http://localhost (or your VPS IP) - Served by Node.js"
echo "   Backend API: http://localhost:3001"
echo "   Health Check: http://localhost:3001/health"
echo ""
echo "🔧 Useful commands:"
echo "   View logs: docker-compose logs -f"
echo "   Restart: docker-compose restart"
echo "   Stop: docker-compose down"
echo "   Status: docker-compose ps"
echo ""
echo "📊 Monitor containers:"
echo "   docker stats"
echo "   docker-compose top"
echo ""
echo "💡 Note: Frontend is served by Node.js (no Nginx required)" 