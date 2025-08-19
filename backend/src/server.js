const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// AGGRESSIVE TIMEOUT BYPASS - Your custom server needs unlimited time!
const server = require("http").createServer(app);
server.timeout = 0; // NO TIMEOUT - Unlimited time for your custom server
server.keepAliveTimeout = 0; // NO KEEP-ALIVE TIMEOUT - Keep connections alive forever
server.headersTimeout = 0; // NO HEADERS TIMEOUT - Unlimited headers processing time

// Initialize WebSocket chat service
const ChatService = require("./services/chatService");
const chatService = new ChatService(server);

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || "https://eznotespro.netlify.app",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:3000",
      "http://83.229.115.190:3001",
      "http://83.229.115.190:8080", // Frontend port
      "http://83.229.115.190",
      "https://83.229.115.190",
      "https://83.229.115.190:3001",
    ],
    credentials: true,
  })
);
app.use(morgan("combined"));

// Increase body parser limits for large files
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

// Configure multer for file uploads
const upload = multer({
  dest: "temp/",
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || "200") * 1024 * 1024, // Use same limit as upload middleware
  },
  fileFilter: (req, file, cb) => {
    // Allow audio files
    if (file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"));
    }
  },
});

// AGGRESSIVE TIMEOUT BYPASS - Your custom server needs unlimited time!
app.use((req, res, next) => {
  // NO TIMEOUTS - Unlimited time for your custom server
  if (req.path.startsWith("/api/upload")) {
    req.setTimeout(0); // NO TIMEOUT - Unlimited upload time
    res.setTimeout(0); // NO TIMEOUT - Unlimited response time
  } else if (req.path.startsWith("/api/")) {
    req.setTimeout(0); // NO TIMEOUT - Unlimited API time
    res.setTimeout(0); // NO TIMEOUT - Unlimited response time
  } else {
    req.setTimeout(0); // NO TIMEOUT - Unlimited time for everything
    res.setTimeout(0); // NO TIMEOUT - Unlimited response time
  }
  next();
});

// Static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/notes", require("./routes/notes"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/files", require("./routes/files"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/queue", require("./routes/queue"));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Handle timeout errors specifically
  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT") {
    return res.status(408).json({
      error: "Upload timeout",
      message:
        "The upload took too long and the connection was reset. Please try with a smaller file or check your internet connection.",
    });
  }

  res.status(500).json({
    error: "Something went wrong!",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Use the server instance instead of app.listen
server.listen(PORT, () => {
  console.log(`🚀 ClearlyAI Server running on port ${PORT}`);
  console.log(`📁 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `⏱️ TIMEOUT BYPASS: NO TIMEOUTS - Your custom server has unlimited time!`
  );
  console.log(`📏 Max file size: ${process.env.MAX_FILE_SIZE || "100"}MB`);
  console.log(
    `🌐 Frontend URL: ${
      process.env.FRONTEND_URL || "https://eznotespro.netlify.app"
    }`
  );
  console.log(`🔒 Health check: http://localhost:${PORT}/health`);
  console.log(`🔒 External health check: http://83.229.115.190:${PORT}/health`);
});
