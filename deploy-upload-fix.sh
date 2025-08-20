#!/bin/bash

# Deploy Upload Fix Script
# This script updates the backend with the latest upload fixes

echo "🚀 Deploying Upload Fix to Production..."
echo "========================================"

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Please run this script from the clearlyai-unified directory"
    exit 1
fi

echo "📋 Current status:"
docker-compose ps

echo ""
echo "🔄 Pulling latest code..."
git pull origin master

echo ""
echo "🔨 Rebuilding backend with latest fixes..."
docker-compose build backend

if [ $? -ne 0 ]; then
    echo "❌ Backend build failed"
    exit 1
fi

echo ""
echo "🚀 Restarting backend service..."
docker-compose up -d backend

if [ $? -ne 0 ]; then
    echo "❌ Backend restart failed"
    exit 1
fi

echo ""
echo "⏳ Waiting for backend to start..."
sleep 15

echo ""
echo "🔍 Checking backend health..."
curl -s http://localhost:3001/health || echo "❌ Health check failed"

echo ""
echo "📊 Backend logs (last 30 lines):"
docker-compose logs --tail=30 backend

echo ""
echo "✅ Upload fix deployment completed!"
echo ""
echo "🧪 Test the upload again - it should now:"
echo "1. Use chunked upload for files >5MB"
echo "2. Show detailed debugging logs"
echo "3. Handle errors gracefully"
echo "4. Not timeout during finalization"
echo ""
echo "📝 To monitor logs: docker-compose logs -f backend" 