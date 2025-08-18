# ClearlyAI Deployment Guide

## 🚀 **Quick Deployment Steps**

### **1. Update Code on Server**

```bash
# On your server (eznotes), pull latest code
cd ~/EZnotes-full-server
git pull origin master
```

### **2. Fix Database Schema**

```bash
# Copy and run the database migration
docker cp backend/fix-db.sql eznotes-full-server-postgres-1:/tmp/
docker-compose exec postgres psql -U clearlyAI -d clearlyai_db -f /tmp/fix-db.sql
```

### **3. Rebuild Backend**

```bash
# Rebuild backend with all new features
docker-compose build backend
docker-compose up -d backend
```

### **4. Verify Deployment**

```bash
# Check backend is running
docker-compose ps

# Check backend logs
docker-compose logs -f backend

# Test health endpoint
curl http://83.229.115.190:3001/health
```

---

## 🔧 **What's New in This Update**

### **Frontend Features**

- ✅ **Enhanced Upload**: Audio recording + file upload + custom prompts
- ✅ **Integrated Chat**: Left side chat, right side notes display
- ✅ **Management Center**: Chat history, notes, and files management
- ✅ **Unified Dashboard**: Single-page app with tabbed navigation

### **Backend Features**

- ✅ **OpenAI Integration**: Direct Whisper + GPT-4o processing
- ✅ **Chat System**: WebSocket-ready chat with note context
- ✅ **Database Schema**: Updated tables for all new features
- ✅ **API Routes**: Complete REST API for all functionality

### **Database Changes**

- ✅ **Users Table**: Added first_name, last_name, is_active columns
- ✅ **Files Table**: Added transcription column
- ✅ **Notes Table**: Added version, prompt_used, ai_model columns
- ✅ **New Tables**: chat_conversations, chat_messages, custom_prompts

---

## 🧪 **Testing the Deployment**

### **Quick Test Commands**

```bash
# Test backend health
curl http://83.229.115.190:3001/health

# Test frontend
curl -I http://83.229.115.190:8081

# Check database tables
docker-compose exec postgres psql -U clearlyAI -d clearlyai_db -c "\dt"
```

### **User Testing Flow**

1. **Open Frontend**: http://83.229.115.190:8081
2. **Register User**: Create new account
3. **Upload File**: Test with .txt or audio file
4. **Chat with AI**: Ask questions about uploaded content
5. **Check Management**: View history and files

---

## 🚨 **Troubleshooting**

### **Common Issues**

#### **Database Schema Errors**

```bash
# If you get column errors, run migration again
docker cp backend/fix-db.sql eznotes-full-server-postgres-1:/tmp/
docker-compose exec postgres psql -U clearlyAI -d clearlyai_db -f /tmp/fix-db.sql
```

#### **Backend Not Starting**

```bash
# Check logs
docker-compose logs backend

# Rebuild if needed
docker-compose build backend
docker-compose up -d backend
```

#### **Frontend Connection Issues**

```bash
# Check backend is accessible
curl http://83.229.115.190:3001/health

# Verify port mapping
docker-compose ps
```

### **Log Monitoring**

```bash
# Monitor all services
docker-compose logs -f

# Monitor specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

---

## 📋 **Environment Variables**

### **Required Variables**

```yaml
# In docker-compose.yml
environment:
  OPENAI_API_KEY: "your_actual_openai_key_here"
  OPENAI_MODEL: "gpt-4o"
  WHISPER_MODEL: "whisper-1"
  JWT_SECRET: "your_jwt_secret"
  DB_HOST: postgres
  DB_USER: clearlyAI
  DB_PASSWORD: clearly_postgres
```

### **Optional Variables**

```yaml
environment:
  CHAT_MAX_TOKENS: 1000
  CHAT_TEMPERATURE: 0.3
  MAX_FILE_SIZE: 100
  ADMIN_EMAIL: "your_admin_email"
  ADMIN_PASSWORD: "your_admin_password"
```

---

## 🎯 **Success Indicators**

### **Backend Health**

- ✅ Health endpoint responds: `{"status":"healthy","timestamp":"..."}`
- ✅ Database connection established
- ✅ All routes accessible

### **Frontend Functionality**

- ✅ Login/Register pages load
- ✅ Dashboard displays correctly
- ✅ Upload functionality works
- ✅ Chat interface responsive

### **Database Status**

- ✅ All tables exist
- ✅ Users can be created
- ✅ Files can be uploaded
- ✅ Notes can be generated

---

## 📞 **Support**

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify database schema: `\dt` and `\d users`
3. Test API endpoints with curl
4. Check environment variables are set correctly

---

## 🚀 **Next Steps After Deployment**

1. **Test Core Features**: Upload, chat, management
2. **Verify AI Integration**: Check OpenAI API responses
3. **User Acceptance Testing**: Have users try the system
4. **Performance Monitoring**: Monitor response times
5. **Security Review**: Verify user isolation and authentication
