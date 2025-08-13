#!/bin/bash

# ClearlyAI Full Stack Deployment Script for VPS
# This script deploys both frontend and backend using Docker

set -e

echo "🚀 Starting ClearlyAI Full Stack deployment..."

# Check if we're in the right directory
if [ ! -f "docker-compose.fullstack.yml" ]; then
    echo "❌ Error: Please run this script from the frontend directory"
    exit 1
fi

# Check if backend directory exists
if [ ! -d "../clearlyai-server" ]; then
    echo "❌ Error: Backend directory not found. Please ensure both frontend and backend are in the same parent directory."
    exit 1
fi

# Stop any existing containers
echo "🔄 Stopping existing containers..."
docker-compose -f docker-compose.fullstack.yml down 2>/dev/null || true

# Remove old images to ensure fresh build
echo "🧹 Cleaning up old images..."
docker image prune -f

# Build and start the full stack
echo "🔨 Building and starting full stack..."
docker-compose -f docker-compose.fullstack.yml up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service status
echo "🔍 Checking service status..."
docker-compose -f docker-compose.fullstack.yml ps

# Test the services
echo "🧪 Testing services..."

# Test frontend
echo "   Testing frontend..."
if curl -s http://localhost > /dev/null; then
    echo "   ✅ Frontend is running on http://localhost"
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
if docker-compose -f docker-compose.fullstack.yml exec -T postgres pg_isready -U clearlyAI -d clearlyai_db > /dev/null 2>&1; then
    echo "   ✅ Database is ready"
else
    echo "   ❌ Database is not ready"
fi

echo ""
echo "✅ Deployment completed!"
echo ""
echo "🌐 Access your application:"
echo "   Frontend: http://localhost (or your VPS IP)"
echo "   Backend API: http://localhost:3001"
echo "   Health Check: http://localhost:3001/health"
echo ""
echo "🔧 Useful commands:"
echo "   View logs: docker-compose -f docker-compose.fullstack.yml logs -f"
echo "   Restart: docker-compose -f docker-compose.fullstack.yml restart"
echo "   Stop: docker-compose -f docker-compose.fullstack.yml down"
echo "   Status: docker-compose -f docker-compose.fullstack.yml ps"
echo ""
echo "📊 Monitor containers:"
echo "   docker stats"
echo "   docker-compose -f docker-compose.fullstack.yml top" 