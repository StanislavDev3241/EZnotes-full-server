# 🚀 VPS Deployment Guide

## **Quick Deployment on VPS**

### **Step 1: Clone the Unified Repository**
```bash
# On your VPS
cd ~
git clone https://github.com/StanislavDev3241/clearlyai-unified.git
cd clearlyai-unified
```

### **Step 2: Deploy Everything**
```bash
# Make deployment script executable
chmod +x deploy.sh

# Deploy the complete stack
./deploy.sh
```

### **Step 3: Access Your Application**
- **Frontend**: `http://83.229.115.190` (port 80)
- **Backend API**: `http://83.229.115.190:3001`
- **Health Check**: `http://83.229.115.190:3001/health`

## **What Gets Deployed**

✅ **Frontend**: React app with Nginx (port 80)
✅ **Backend**: Node.js API server (port 3001)  
✅ **Database**: PostgreSQL (port 5433)
✅ **Cache**: Redis (port 6380)
✅ **All services**: Running in Docker containers

## **Management Commands**

```bash
# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop everything
docker-compose down

# Rebuild and start
docker-compose up -d --build
```

## **Troubleshooting**

If something goes wrong:
1. Check logs: `docker-compose logs`
2. Check status: `docker-compose ps`
3. Restart: `docker-compose restart`

## **Benefits of Unified Repository**

🎯 **No more path issues** - Everything is in one place
🔒 **No mixed content** - Frontend and backend on same server
🐳 **Simple Docker deployment** - One command deploys everything
📱 **Easy updates** - Pull latest code and redeploy

---

**Ready to deploy! Just run `./deploy.sh`** 🚀 