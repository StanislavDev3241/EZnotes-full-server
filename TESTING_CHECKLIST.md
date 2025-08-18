# ClearlyAI Testing Checklist

## 🚀 **Pre-Testing Setup**

### **Database Schema Update**
- [ ] Run database migration on server:
  ```bash
  git pull origin master
  docker cp backend/fix-db.sql eznotes-full-server-postgres-1:/tmp/
  docker-compose exec postgres psql -U clearlyAI -d clearlyai_db -f /tmp/fix-db.sql
  ```

### **Backend Rebuild**
- [ ] Rebuild backend with new features:
  ```bash
  docker-compose build backend
  docker-compose up -d backend
  ```

### **Environment Variables**
- [ ] Verify OpenAI API key is set in docker-compose.yml
- [ ] Check all required environment variables are configured

---

## 🧪 **Core Functionality Testing**

### **1. User Authentication**
- [ ] **User Registration**
  - Navigate to frontend (http://83.229.115.190:8081)
  - Click "Register" and create new account
  - Verify user is created in database
  - Check JWT token is received

- [ ] **User Login**
  - Login with registered credentials
  - Verify JWT token is stored
  - Check user dashboard loads correctly

- [ ] **Admin Login**
  - Login with admin credentials
  - Verify admin privileges work

### **2. File Upload & Processing**
- [ ] **Text File Upload**
  - Upload a .txt file with medical content
  - Verify file is processed
  - Check transcription is generated
  - Verify SOAP notes are created

- [ ] **Audio File Upload**
  - Upload audio file (.mp3, .wav, .m4a)
  - Verify Whisper transcription works
  - Check notes are generated from transcription

- [ ] **Audio Recording**
  - Use built-in recording feature
  - Verify recording saves and processes
  - Check transcription quality

- [ ] **Custom Prompts**
  - Test with custom medical instructions
  - Verify AI follows custom prompts
  - Check prompt is saved with notes

### **3. AI Chat System**
- [ ] **Chat with AI**
  - Upload a file to get context
  - Ask questions about the content
  - Verify AI responses are relevant
  - Check conversation history saves

- [ ] **Note Context Integration**
  - Verify AI has access to file context
  - Test asking about specific medical details
  - Check AI can reference transcription and notes

- [ ] **Conversation Persistence**
  - Have multiple chat exchanges
  - Refresh page and verify history remains
  - Check database stores conversations

### **4. Management Features**
- [ ] **Chat History**
  - Navigate to Management tab
  - View chat conversations
  - Open chat history modal
  - Verify message threading

- [ ] **Notes Management**
  - View generated notes
  - Check note versions and status
  - Verify custom prompts are displayed

- [ ] **File Management**
  - View uploaded files
  - Download transcriptions
  - Check file statistics

---

## 🔍 **Technical Testing**

### **Backend API Endpoints**
- [ ] **Health Check**: `GET /health`
- [ ] **Authentication**: `POST /api/auth/register`, `POST /api/auth/login`
- [ ] **File Upload**: `POST /api/upload`
- [ ] **Chat**: `POST /api/chat`, `GET /api/chat/history/:userId`
- [ ] **Notes**: `GET /api/notes/user/:userId`
- [ ] **Files**: `GET /api/files/user/:userId`

### **Database Operations**
- [ ] User creation and authentication
- [ ] File upload and storage
- [ ] Note generation and storage
- [ ] Chat conversation persistence
- [ ] Transcription storage

### **OpenAI Integration**
- [ ] Whisper API transcription
- [ ] GPT-4o note generation
- [ ] GPT-4o chat responses
- [ ] Context-aware AI interactions

---

## 🐛 **Error Handling Testing**

### **Network Issues**
- [ ] Test with slow internet connection
- [ ] Verify timeout handling
- [ ] Check retry mechanisms

### **Invalid Inputs**
- [ ] Upload unsupported file types
- [ ] Test with empty custom prompts
- [ ] Verify malformed requests are handled

### **API Failures**
- [ ] Test with invalid OpenAI API key
- [ ] Verify graceful degradation
- [ ] Check error messages are user-friendly

---

## 📱 **User Experience Testing**

### **Responsive Design**
- [ ] Test on desktop browsers
- [ ] Test on mobile devices
- [ ] Verify tab navigation works
- [ ] Check modal dialogs function

### **Performance**
- [ ] Measure file upload speed
- [ ] Check AI response time
- [ ] Verify page load performance
- [ ] Test with large files

### **Accessibility**
- [ ] Keyboard navigation
- [ ] Screen reader compatibility
- [ ] Color contrast compliance
- [ ] Error message clarity

---

## 🚨 **Security Testing**

### **Authentication**
- [ ] Verify JWT token validation
- [ ] Test unauthorized access attempts
- [ ] Check user isolation
- [ ] Verify admin privileges

### **Data Protection**
- [ ] Check file upload security
- [ ] Verify user data isolation
- [ ] Test SQL injection prevention
- [ ] Check XSS protection

---

## 📊 **Success Criteria**

### **Functional Requirements**
- [ ] Users can register and login
- [ ] Files can be uploaded and processed
- [ ] AI generates accurate medical notes
- [ ] Chat system works with note context
- [ ] Management features display data correctly

### **Performance Requirements**
- [ ] File upload completes within reasonable time
- [ ] AI responses arrive within 10 seconds
- [ ] Page loads within 3 seconds
- [ ] Database queries complete quickly

### **Quality Requirements**
- [ ] No critical errors in console
- [ ] All features work as expected
- [ ] User interface is intuitive
- [ ] Error messages are helpful

---

## 🎯 **Testing Commands**

### **Database Check**
```bash
# Check if tables exist
docker-compose exec postgres psql -U clearlyAI -d clearlyai_db -c "\dt"

# Check users table structure
docker-compose exec postgres psql -U clearlyAI -d clearlyai_db -c "\d users"

# Check if data exists
docker-compose exec postgres psql -U clearlyAI -d clearlyai_db -c "SELECT COUNT(*) FROM users;"
```

### **Backend Logs**
```bash
# Monitor backend logs
docker-compose logs -f backend

# Check for errors
docker-compose logs backend | grep -i error
```

### **Frontend Testing**
```bash
# Check frontend accessibility
curl -I http://83.229.115.190:8081

# Test backend connectivity
curl -I http://83.229.115.190:3001/health
```

---

## 📝 **Bug Reporting**

When issues are found, document:
1. **Steps to reproduce**
2. **Expected vs actual behavior**
3. **Error messages and logs**
4. **Browser/device information**
5. **Screenshots if applicable**

---

## ✅ **Completion Checklist**

- [ ] All functional tests pass
- [ ] No critical errors found
- [ ] Performance meets requirements
- [ ] Security tests pass
- [ ] User experience is satisfactory
- [ ] Documentation is complete
- [ ] Ready for production deployment 