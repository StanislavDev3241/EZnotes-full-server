const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Increase timeout for large file uploads and AI processing
const server = require("http").createServer(app);
server.timeout = 900000; // 15 minutes timeout (accommodates 10 min Make.com + buffer)
server.keepAliveTimeout = 65000; // 65 seconds keep-alive
server.headersTimeout = 66000; // 66 seconds headers timeout

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

// Add timeout middleware for uploads and AI processing
app.use((req, res, next) => {
  // Set timeout for upload requests and AI processing
  if (req.path === "/api/upload" && req.method === "POST") {
    req.setTimeout(900000); // 15 minutes for uploads + AI processing
    res.setTimeout(900000);
  } else if (req.path === "/api/upload/webhook" && req.method === "POST") {
    req.setTimeout(900000); // 15 minutes for Make.com webhooks
    res.setTimeout(900000);
  } else {
    req.setTimeout(60000); // 1 minute for other requests
    res.setTimeout(60000);
  }
  next();
});

// Static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/notes", require("./routes/notes"));
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
    `⏱️ Upload timeout: 15 minutes (accommodates 10 min Make.com processing)`
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
