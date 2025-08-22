# ClearlyAI Deployment Guide

## 🚀 **Quick Deployment**

### **1. Environment Setup**

Create a `.env` file in the root directory:

```bash
# Copy and edit the environment template
cp .env.example .env
```

Required environment variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o

# Database Configuration
POSTGRES_USER=clearlyAI
POSTGRES_PASSWORD=clearly_postgres
POSTGRES_DB=clearlyai_db

# JWT Configuration
JWT_SECRET=your_jwt_secret_here

# Application Settings
NODE_ENV=production
PORT=3001
```

### **2. Deploy with Docker**

```bash
# Build and start all services
docker-compose up -d --build

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### **3. Verify Deployment**

```bash
# Check application health
curl http://localhost:3001/health

# Check frontend
curl http://localhost

# Check database connection
docker exec clearlyai-unified-postgres-1 pg_isready
```

## 🔧 **Production Configuration**

### **Environment Variables**

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key | ✅ | - |
| `JWT_SECRET` | JWT signing secret | ✅ | - |
| `POSTGRES_PASSWORD` | Database password | ✅ | - |
| `NODE_ENV` | Environment mode | ❌ | `production` |
| `PORT` | Backend port | ❌ | `3001` |

### **Port Configuration**

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 80 | Web application |
| Backend | 3001 | API server |
| PostgreSQL | 5433 | Database |
| Redis | 6380 | Cache |

## 🛠️ **Management Commands**

### **Service Management**

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Rebuild and start
docker-compose up -d --build
```

### **Logs and Monitoring**

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres

# Check resource usage
docker stats
```

### **Database Management**

```bash
# Connect to database
docker exec -it clearlyai-unified-postgres-1 psql -U clearlyAI -d clearlyai_db

# Backup database
docker exec clearlyai-unified-postgres-1 pg_dump -U clearlyAI clearlyai_db > backup.sql

# Restore database
docker exec -i clearlyai-unified-postgres-1 psql -U clearlyAI -d clearlyai_db < backup.sql
```

## 🔍 **Troubleshooting**

### **Common Issues**

1. **Port Conflicts**
   ```bash
   # Check port usage
   netstat -tulpn | grep :80
   netstat -tulpn | grep :3001
   
   # Stop conflicting services
   sudo systemctl stop nginx  # if using nginx
   ```

2. **Permission Issues**
   ```bash
   # Fix upload directory permissions
   sudo chown -R 1000:1000 uploads/
   sudo chmod -R 755 uploads/
   ```

3. **Database Connection**
   ```bash
   # Check PostgreSQL status
   docker-compose logs postgres
   
   # Reset database
   docker-compose down -v
   docker-compose up -d
   ```

### **Health Checks**

```bash
# Application health
curl http://localhost:3001/health

# Database health
docker exec clearlyai-unified-postgres-1 pg_isready

# Redis health
docker exec clearlyai-unified-redis-1 redis-cli ping
```

## 🔒 **Security Checklist**

- [ ] Change default passwords
- [ ] Set strong JWT secret
- [ ] Configure firewall rules
- [ ] Enable HTTPS (production)
- [ ] Set up SSL certificates
- [ ] Configure backup strategy
- [ ] Set up monitoring
- [ ] Review file permissions

## 📊 **Monitoring Setup**

### **Basic Monitoring**

```bash
# Create monitoring script
cat > monitor.sh << 'EOF'
#!/bin/bash
echo "=== ClearlyAI Health Check ==="
echo "Time: $(date)"
echo ""

# Check containers
echo "Container Status:"
docker-compose ps
echo ""

# Check health endpoints
echo "Health Checks:"
curl -s http://localhost:3001/health | jq .
echo ""

# Check resource usage
echo "Resource Usage:"
docker stats --no-stream
EOF

chmod +x monitor.sh
```

### **Automated Monitoring**

```bash
# Add to crontab for regular checks
crontab -e

# Add this line for every 5 minutes
*/5 * * * * /path/to/clearlyai-unified/monitor.sh >> /var/log/clearlyai-monitor.log 2>&1
```

## 🚀 **Scaling**

### **Horizontal Scaling**

```bash
# Scale backend services
docker-compose up -d --scale backend=3

# Add load balancer
# Configure nginx or haproxy for load balancing
```

### **Database Scaling**

```bash
# Add read replicas
# Configure PostgreSQL replication
# Set up connection pooling
```

## 📝 **Backup Strategy**

### **Database Backup**

```bash
# Daily backup script
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/clearlyai"
mkdir -p $BACKUP_DIR

# Database backup
docker exec clearlyai-unified-postgres-1 pg_dump -U clearlyAI clearlyai_db > $BACKUP_DIR/db_backup_$DATE.sql

# File backup
tar -czf $BACKUP_DIR/files_backup_$DATE.tar.gz uploads/

# Clean old backups (keep 7 days)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x backup.sh
```

### **Automated Backups**

```bash
# Add to crontab
0 2 * * * /path/to/clearlyai-unified/backup.sh >> /var/log/clearlyai-backup.log 2>&1
```

---

**For additional support, check the main README.md file or open an issue on GitHub.** 