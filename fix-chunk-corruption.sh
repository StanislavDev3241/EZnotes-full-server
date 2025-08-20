#!/bin/bash

# Chunk Upload Corruption Fix Deployment Script
# This script applies the fix for the "English English English" transcription corruption issue

echo "🔧 Applying Chunk Upload Corruption Fix..."
echo "=========================================="

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Please run this script from the clearlyai-unified directory"
    exit 1
fi

echo "📋 Current status:"
docker-compose ps

echo ""
echo "🔄 Rebuilding backend with corruption fix..."
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
sleep 10

echo ""
echo "🔍 Checking backend health..."
curl -s http://localhost:3001/health || echo "❌ Health check failed"

echo ""
echo "📊 Backend logs (last 20 lines):"
docker-compose logs --tail=20 backend

echo ""
echo "✅ Fix deployment completed!"
echo ""
echo "🧪 Testing recommendations:"
echo "1. Upload a large audio file (>50MB) to test chunked upload"
echo "2. Check that transcription is not corrupted"
echo "3. Monitor backend logs for any errors"
echo ""
echo "📝 To monitor logs: docker-compose logs -f backend"
echo "📝 To check status: docker-compose ps" 