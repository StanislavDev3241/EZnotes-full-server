# ClearlyAI - AI-Powered Dental Documentation System

A comprehensive AI-powered application for dental professionals to transcribe audio consultations, generate SOAP notes, and create patient summaries with natural language chat capabilities.

## 🎯 **Overview**

ClearlyAI is a full-stack web application that helps dental professionals:
- **Transcribe audio consultations** using OpenAI Whisper
- **Generate SOAP notes** automatically from transcriptions
- **Create patient summaries** with key clinical information
- **Chat with AI** for note improvements and dental guidance
- **Manage patient records** with HIPAA-compliant security

## 🏗️ **Architecture**

```
clearlyai-unified/
├── frontend/                 # React TypeScript frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── App.tsx         # Main application
│   │   └── main.tsx        # Entry point
│   ├── Dockerfile          # Frontend container
│   └── package.json        # Frontend dependencies
├── backend/                 # Node.js Express API
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Authentication & validation
│   │   └── config/         # Database & configuration
│   ├── Dockerfile          # Backend container
│   └── package.json        # Backend dependencies
├── docker-compose.yml      # Complete stack orchestration
├── .gitignore             # Git ignore rules
└── README.md              # This documentation
```

## 🚀 **Quick Start**

### **Prerequisites**

- Docker and Docker Compose
- Git
- OpenAI API key

### **1. Clone and Setup**

```bash
# Clone the repository
git clone https://github.com/your-username/clearlyai-unified.git
cd clearlyai-unified

# Copy environment template
cp .env.example .env
```

### **2. Configure Environment**

Edit `.env` file with your settings:

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

### **3. Deploy**

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### **4. Access Application**

- **Frontend**: http://localhost
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

## 🐳 **Services**

| Service        | Port | Description                    |
|----------------|------|--------------------------------|
| **Frontend**   | 80   | React application (Node.js)    |
| **Backend**    | 3001 | Express.js API server          |
| **PostgreSQL** | 5433 | Primary database               |
| **Redis**      | 6380 | Caching and session storage    |

## 📱 **Features**

### **🎤 Audio Processing**
- **File Upload**: Support for MP3, WAV, M4A formats
- **Audio Recording**: Browser-based recording capability
- **Chunked Uploads**: Large file support with progress tracking
- **Transcription**: OpenAI Whisper integration for accurate speech-to-text

### **📝 Note Generation**
- **SOAP Notes**: Structured Subjective, Objective, Assessment, Plan format
- **Patient Summaries**: Concise clinical summaries
- **Custom Prompts**: Tailored note generation instructions
- **Quality Analysis**: AI-powered completeness checking

### **💬 AI Chat Interface**
- **Natural Conversation**: ChatGPT-like interaction
- **Context Awareness**: Uses transcription and note context
- **Note Improvement**: AI suggestions for better documentation
- **Dental Guidance**: Professional dental advice and terminology

### **🔐 Security & Compliance**
- **JWT Authentication**: Secure user sessions
- **Role-Based Access**: Admin and user permissions
- **HIPAA Compliance**: Patient data protection
- **File Encryption**: Secure file storage

### **📊 User Management**
- **User Registration**: Email-based accounts
- **Admin Dashboard**: User management interface
- **Session Management**: Secure login/logout
- **Activity Tracking**: User action logging

## 🛠️ **API Endpoints**

### **Authentication**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### **File Processing**
- `POST /api/upload` - Upload audio files
- `GET /api/upload/:id` - Get upload status
- `DELETE /api/upload/:id` - Delete upload

### **Chat & Notes**
- `POST /api/chat` - Send chat message
- `GET /api/chat/history` - Get conversation history
- `POST /api/notes/generate` - Generate notes from transcription

### **Health & Monitoring**
- `GET /health` - Service health check
- `GET /api/status` - Application status

## 🔧 **Configuration**

### **Environment Variables**

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `OPENAI_MODEL` | OpenAI model to use | `gpt-4o` |
| `JWT_SECRET` | JWT signing secret | Required |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Backend port | `3001` |

### **Database Schema**

The application uses PostgreSQL with the following key tables:
- `users` - User accounts and authentication
- `uploads` - File upload records
- `notes` - Generated SOAP notes and summaries
- `conversations` - Chat conversation history
- `sessions` - User session management

## 🚀 **Deployment**

### **Production Deployment**

```bash
# Build and start all services
docker-compose up -d --build

# Check service health
curl http://localhost:3001/health

# Monitor logs
docker-compose logs -f
```

### **Development Mode**

```bash
# Start with development settings
docker-compose -f docker-compose.dev.yml up -d

# Hot reload for development
docker-compose -f docker-compose.dev.yml up --build
```

## 🔍 **Troubleshooting**

### **Common Issues**

1. **Port Conflicts**
   ```bash
   # Check port usage
   netstat -tulpn | grep :80
   netstat -tulpn | grep :3001
   ```

2. **Database Connection**
   ```bash
   # Check PostgreSQL status
   docker-compose logs postgres
   docker exec -it clearlyai-unified-postgres-1 psql -U clearlyAI -d clearlyai_db
   ```

3. **File Upload Issues**
   ```bash
   # Check upload directory permissions
   ls -la uploads/
   chmod 755 uploads/
   ```

### **Logs and Debugging**

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Check container status
docker-compose ps
docker stats
```

## 📊 **Monitoring**

### **Health Checks**

```bash
# Application health
curl http://localhost:3001/health

# Database health
docker exec clearlyai-unified-postgres-1 pg_isready

# Redis health
docker exec clearlyai-unified-redis-1 redis-cli ping
```

### **Performance Monitoring**

```bash
# Container resource usage
docker stats

# Database performance
docker exec clearlyai-unified-postgres-1 psql -U clearlyAI -d clearlyai_db -c "SELECT * FROM pg_stat_activity;"
```

## 🔒 **Security**

### **Best Practices**

1. **Environment Variables**: Never commit API keys to version control
2. **JWT Secrets**: Use strong, unique JWT secrets
3. **Database Passwords**: Use complex database passwords
4. **File Permissions**: Restrict upload directory permissions
5. **HTTPS**: Use SSL/TLS in production

### **HIPAA Compliance**

- All patient data is encrypted at rest
- Secure file upload and storage
- Audit logging for data access
- Role-based access control
- Session timeout and management

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 **License**

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 **Support**

For support and questions:

1. Check the troubleshooting section
2. Review the logs: `docker-compose logs`
3. Open an issue on GitHub
4. Contact the development team

---

**Built with ❤️ using React, Node.js, PostgreSQL, and OpenAI**

*Version: 1.0.0 | Last Updated: August 2025* 