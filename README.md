# ClearlyAI - Unified Full Stack Application

A complete AI-powered audio transcription and note generation application with unified frontend and backend deployment.

## 🏗️ **Architecture**

```
clearlyai-unified/
├── frontend/           # React frontend application
│   ├── src/           # React source code
│   ├── Dockerfile     # Frontend Docker configuration
│   └── package.json   # Frontend dependencies
├── backend/            # Node.js backend API
│   ├── src/           # Backend source code
│   ├── Dockerfile     # Backend Docker configuration
│   └── package.json   # Backend dependencies
├── docker-compose.yml  # Complete stack orchestration
├── deploy.sh          # Automated deployment script
└── README.md          # This file
```

## 🚀 **Quick Start**

### **Prerequisites**
- Docker and Docker Compose installed
- Git

### **Deployment**
```bash
# Clone the repository
git clone <your-repo-url>
cd clearlyai-unified

# Make deployment script executable
chmod +x deploy.sh

# Deploy the full stack
./deploy.sh
```

## 🐳 **Services**

| Service | Port | Description |
|---------|------|-------------|
| **Frontend** | 80 | React application with Nginx |
| **Backend** | 3001 | Node.js API server |
| **PostgreSQL** | 5433 | Database |
| **Redis** | 6380 | Cache and queue |

## 🔧 **Configuration**

### **Environment Variables**
All environment variables are configured in `docker-compose.yml`:

- `NODE_ENV`: Production environment
- `DB_USER`: PostgreSQL username
- `DB_PASSWORD`: PostgreSQL password
- `JWT_SECRET`: Authentication secret
- `MAKE_WEBHOOK_URL`: AI processing webhook

### **Database**
- **Database**: `clearlyai_db`
- **Username**: `clearlyAI`
- **Password**: `clearly_postgres`

## 📱 **Features**

### **Frontend**
- ✅ File upload (audio/text)
- ✅ Audio recording
- ✅ SOAP note generation
- ✅ Patient summary generation
- ✅ HIPAA compliance
- ✅ Admin/User role management

### **Backend**
- ✅ File processing API
- ✅ User authentication
- ✅ Database management
- ✅ Redis caching
- ✅ Task queuing
- ✅ Make.com integration

## 🛠️ **Management Commands**

```bash
# View all services
docker-compose ps

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop all services
docker-compose down

# Rebuild and start
docker-compose up -d --build
```

## 🔍 **Troubleshooting**

### **Common Issues**

1. **Port conflicts**: Ensure ports 80, 3001, 5433, 6380 are available
2. **Permission errors**: Run with appropriate user permissions
3. **Database connection**: Check PostgreSQL container status

### **Logs**
```bash
# Frontend logs
docker-compose logs frontend

# Backend logs
docker-compose logs backend

# Database logs
docker-compose logs postgres
```

## 🌐 **Access Points**

- **Application**: `http://your-server-ip`
- **API Health**: `http://your-server-ip:3001/health`
- **API Endpoints**: `http://your-server-ip:3001/api/*`

## 📊 **Monitoring**

```bash
# Resource usage
docker stats

# Container status
docker-compose top

# Health checks
curl http://localhost:3001/health
```

## 🔒 **Security**

- JWT-based authentication
- Role-based access control
- HIPAA compliance features
- Secure file handling
- Environment variable configuration

## 📝 **Development**

To modify the application:

1. Edit files in `frontend/` or `backend/`
2. Rebuild containers: `docker-compose up -d --build`
3. Test changes

## 🤝 **Support**

For issues or questions:
1. Check the logs: `docker-compose logs`
2. Verify service status: `docker-compose ps`
3. Check configuration in `docker-compose.yml`

---

**Built with ❤️ using Docker, React, Node.js, and PostgreSQL** 