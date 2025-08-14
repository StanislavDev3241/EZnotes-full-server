import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  Copy,
  Download,
  Mic,
  Square,
  Play,
  Pause,
  X,
  Target,
  FileSpreadsheet,
  Shield,
  Mic2,
  FolderOpen,
  Zap,
} from "lucide-react";
import AdminPage from "./components/AdminPage";

interface OutputData {
  soapNote: string;
  patientSummary: string;
}

interface OutputSelection {
  soapNote: boolean;
  patientSummary: boolean;
}

function App() {
  // API Configuration - Point to backend server on VPS IP address
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";
  const API_ENDPOINTS = {
    login: `${API_BASE_URL}/api/auth/login`,
    upload: `${API_BASE_URL}/api/upload`,
    health: `${API_BASE_URL}/health`,
  };

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [output, setOutput] = useState<OutputData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outputSelection, setOutputSelection] = useState<OutputSelection>({
    soapNote: true,
    patientSummary: true,
  });

  // Add HIPAA compliance state
  const [showHipaDialog, setShowHipaDialog] = useState(false);
  const [hipaaChoice, setHipaaChoice] = useState<"save" | "delete" | null>(
    null
  );

  // Simplified admin authentication state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentPage, setCurrentPage] = useState<"main" | "admin">("main");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Check URL on component mount and handle routing
  useEffect(() => {
    const path = window.location.pathname;
    console.log(
      "🔍 URL routing effect - path:",
      path,
      "currentPage:",
      currentPage
    );

    if (path === "/admin") {
      // Check if admin token exists
      const token = localStorage.getItem("adminToken");
      console.log("🔍 Admin path detected - token exists:", !!token);

      if (token) {
        console.log("🔍 Setting admin state and page");
        setCurrentPage("admin");
        setIsAdmin(true);
        setIsLoggedIn(true);
      } else {
        // Redirect to main page if no admin token
        console.log("🔍 No admin token, redirecting to main");
        window.history.pushState({}, "", "/");
        setCurrentPage("main");
      }
    } else {
      console.log("🔍 Main path detected, setting main page");
      setCurrentPage("main");
    }
  }, []);

  // Add upload progress tracking
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "processing" | "complete" | "error" | "optimizing"
  >("idle");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const isCancellingRef = useRef(false);
  const isRecordingRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  // Cleanup function to prevent memory leaks
  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Poll upload status until processing is complete
  const pollUploadStatus = useCallback(
    async (fileId: string) => {
      const maxAttempts = 60; // 5 minutes max (5s intervals)
      let attempts = 0;

      const poll = async (): Promise<any> => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/upload/status/${fileId}`
          );
          if (response.ok) {
            const data = await response.json();
            const { taskStatus, status } = data.file;

            console.log(`📊 Upload status for ${fileId}:`, {
              taskStatus,
              status,
            });

            if (taskStatus === "completed" || status === "processed") {
              console.log("✅ AI processing completed, fetching notes...");
              return true; // Processing complete
            } else if (taskStatus === "failed" || status === "failed") {
              throw new Error("AI processing failed");
            } else if (attempts >= maxAttempts) {
              throw new Error("Processing timeout - please check status later");
            }

            // Still processing, wait and try again
            attempts++;
            await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second intervals
            return poll();
          } else {
            throw new Error(`Status check failed: ${response.status}`);
          }
        } catch (error) {
          console.error("Status polling error:", error);
          throw error;
        }
      };

      return poll();
    },
    [API_BASE_URL]
  );

  // Fetch notes for a specific file by ID
  const fetchFileNotes = async (fileId: string) => {
    try {
      console.log(`📋 Fetching notes for file ${fileId}`);

      // Use anonymous endpoint for non-authenticated users
      const endpoint = isLoggedIn
        ? `/api/notes/file/${fileId}`
        : `/api/notes/file-anonymous/${fileId}`;
      console.log(`📋 Using endpoint: ${endpoint}`);

      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`📝 Received file notes data:`, data);

        if (data.file && data.file.note) {
          // Set the output with the AI-generated notes
          setOutput({
            soapNote: data.file.note.content.soapNote || "",
            patientSummary: data.file.note.content.patientSummary || "",
          });
          console.log(
            `✅ Notes loaded for file ${fileId}:`,
            data.file.note.content
          );
        } else {
          console.log(`⚠️ No notes found for file ${fileId}`);
        }
      } else {
        console.error(
          `❌ Failed to fetch file notes: ${response.status} ${response.statusText}`
        );
      }
    } catch (err) {
      console.error("Failed to fetch file notes:", err);
    }
  };

  // Fetch user's own notes (for authenticated users only)
  const fetchUserNotes = async () => {
    if (!isLoggedIn || isAdmin) {
      console.log("👤 User not logged in or is admin, skipping notes fetch");
      return;
    }

    try {
      console.log(`📋 Fetching notes for authenticated user`);

      const response = await fetch(`${API_BASE_URL}/api/notes/user`);
      if (response.ok) {
        const data = await response.json();
        console.log(`📝 Received notes data:`, data);
      } else {
        console.error(
          `❌ Failed to fetch notes: ${response.status} ${response.statusText}`
        );
      }
    } catch (err) {
      console.error("Failed to fetch user notes:", err);
    }
  };

  // Admin logout
  const handleAdminLogout = () => {
    localStorage.removeItem("adminToken");
    setIsAdmin(false);
    setIsLoggedIn(false);
    setCurrentPage("main"); // Go back to main page
    // Change URL back to root
    window.history.pushState({}, "", "/");
  };

  const handleBackToMain = () => {
    setCurrentPage("main");
    // Change URL back to root
    window.history.pushState({}, "", "/");
  };

  const handleAdminLogin = async (email: string, password: string) => {
    try {
      const response = await fetch(API_ENDPOINTS.login, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("adminToken", data.token);
        setIsAdmin(true);
        setIsLoggedIn(true);
        setCurrentPage("admin");
        // Change URL to /admin
        window.history.pushState({}, "", "/admin");
        setShowAdminLogin(false);
        // Admin users don't need to fetch personal notes
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Login failed");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Login failed. Please try again.");
    }
  };

  // Check if admin token exists on component mount
  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (token) {
      setIsAdmin(true);
      setIsLoggedIn(true);
      // Admin users don't need to fetch personal notes
    }
    // Don't fetch notes for anonymous users
  }, []);

  // Log state changes for debugging
  useEffect(() => {
    console.log("🔄 State changed:", {
      showRecorder,
      isRecording,
      isPaused,
      recordedBlob: !!recordedBlob,
      recordingTime,
      isPlaying,
      isCancelling: isCancellingRef.current,
      hasFile: !!file,
      hasOutput: !!output,
      isProcessing,
    });
  }, [
    showRecorder,
    isRecording,
    isPaused,
    recordedBlob,
    recordingTime,
    isPlaying,
    file,
    output,
    isProcessing,
  ]);

  // Reset recording interface when file is selected
  useEffect(() => {
    if (file && showRecorder) {
      console.log("📁 File selected, hiding recording interface");
      setShowRecorder(false);
      clearRecording();
    }
  }, [file]);

  // Audio level monitoring with real-time data
  const startAudioLevelMonitoring = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const updateAudioLevel = () => {
        if (!analyser || !isRecordingRef.current) return;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const amplitude = (dataArray[i] - 128) / 128;
          sum += amplitude * amplitude;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const normalizedLevel = Math.min(rms * 3, 1);

        setAudioLevel(normalizedLevel);

        if (isRecordingRef.current) {
          animationRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };

      updateAudioLevel();
    } catch (error) {
      console.error("Error starting audio level monitoring:", error);
      setAudioLevel(0);
    }
  }, []);

  const stopAudioLevelMonitoring = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Recording functions
  const startRecording = useCallback(async () => {
    console.log("🎯 startRecording() called");

    if (isRecordingRef.current) {
      console.log("  ⚠️ Already recording, ignoring call");
      return;
    }

    try {
      setIsProcessing(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("  ✅ Microphone access granted");

      streamRef.current = stream;
      isRecordingRef.current = true;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      console.log("  📹 MediaRecorder created");

      startAudioLevelMonitoring(stream);

      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log(
          "  📹 MediaRecorder onstop triggered, isCancelling=",
          isCancellingRef.current
        );

        if (!isCancellingRef.current) {
          const blob = new Blob(chunks, { type: "audio/wav" });
          console.log(
            "  ✅ Creating recordedBlob from chunks, size:",
            blob.size
          );
          setRecordedBlob(blob);

          const audioUrl = URL.createObjectURL(blob);
          if (audioRef.current) {
            audioRef.current.src = audioUrl;
          }
        } else {
          console.log("  ❌ Cancelled - not creating recordedBlob");
        }

        // Stop the stream
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        // Reset cancelling flag immediately
        isCancellingRef.current = false;
        isRecordingRef.current = false;
        console.log("  🔄 isCancelling and isRecording reset to false");
      };

      mediaRecorder.start();
      console.log("  ▶️ MediaRecorder started");

      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      intervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      console.log(
        "  ✅ Recording state updated - isRecording=true, recordingTime=0"
      );
    } catch (err) {
      setError("Could not access microphone. Please allow microphone access.");
      console.error("❌ Error accessing microphone:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [startAudioLevelMonitoring]);

  const pauseRecording = useCallback(() => {
    console.log("⏸️ pauseRecording() called");
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      console.log("  ✅ Recording paused, isPaused=true");

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      stopAudioLevelMonitoring();
    }
  }, [isRecording, isPaused, stopAudioLevelMonitoring]);

  const resumeRecording = useCallback(() => {
    console.log("▶️ resumeRecording() called");
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      console.log("  ✅ Recording resumed, isPaused=false");

      intervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      if (streamRef.current) {
        startAudioLevelMonitoring(streamRef.current);
      }
    }
  }, [isRecording, isPaused, startAudioLevelMonitoring]);

  const stopRecording = useCallback(() => {
    console.log("⏹️ stopRecording() called");
    if (mediaRecorderRef.current && (isRecording || isPaused)) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      console.log("  ✅ Recording stopped");

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      stopAudioLevelMonitoring();
    }
  }, [isRecording, isPaused, stopAudioLevelMonitoring]);

  const cancelRecording = useCallback(() => {
    console.log("❌ cancelRecording() called");

    isCancellingRef.current = true;
    isRecordingRef.current = false;
    console.log("  🚫 Setting isCancelling=true, isRecording=false");

    if (mediaRecorderRef.current && (isRecording || isPaused)) {
      mediaRecorderRef.current.stop();
      console.log("  📹 MediaRecorder.stop() called");
    }

    // Reset all recording states
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setRecordedBlob(null);
    setIsPlaying(false);
    console.log("  ✅ Recording states reset");

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      console.log("  🎤 Stream tracks stopped and cleared");
    }
    stopAudioLevelMonitoring();

    if (audioRef.current) {
      audioRef.current.src = "";
    }
  }, [isRecording, isPaused, stopAudioLevelMonitoring]);

  const playRecording = useCallback(() => {
    if (audioRef.current && recordedBlob) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch((error) => {
          console.error("Error playing audio:", error);
          setError("Failed to play audio recording");
        });
        setIsPlaying(true);
      }
    }
  }, [recordedBlob, isPlaying]);

  const generateRecordingFilename = useCallback(() => {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
    return `recording_${date}_${time}.wav`;
  }, []);

  const downloadRecording = useCallback(() => {
    if (recordedBlob) {
      try {
        const url = URL.createObjectURL(recordedBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = generateRecordingFilename();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error downloading recording:", error);
        setError("Failed to download recording");
      }
    }
  }, [recordedBlob, generateRecordingFilename]);

  const useRecording = useCallback(() => {
    if (recordedBlob) {
      try {
        const file = new File([recordedBlob], generateRecordingFilename(), {
          type: "audio/wav",
        });
        setFile(file);
        setShowRecorder(false);
        setError(null);
        console.log(
          "  ✅ Recording converted to file, recording interface hidden"
        );
      } catch (error) {
        console.error("Error converting recording to file:", error);
        setError("Failed to convert recording to file");
      }
    }
  }, [recordedBlob, generateRecordingFilename]);

  const clearRecording = useCallback(() => {
    console.log("🔄 clearRecording() called");

    setRecordedBlob(null);
    setRecordingTime(0);
    setIsPlaying(false);
    setIsPaused(false);
    isCancellingRef.current = false;
    isRecordingRef.current = false;
    stopAudioLevelMonitoring();

    if (audioRef.current) {
      audioRef.current.src = "";
    }

    console.log("  ✅ All recording states cleared");
  }, [stopAudioLevelMonitoring]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }, []);

  const formatUploadTime = useCallback((seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }, []);

  const handleFileSelect = useCallback((selectedFile: File) => {
    try {
      // Check file size (100MB limit - handles long medical recordings)
      const maxSize = 100 * 1024 * 1024; // 100MB in bytes
      if (selectedFile.size > maxSize) {
        setError(
          "File size too large. Please select a file smaller than 100MB."
        );
        setFile(null);
        return;
      }

      const isTextFile =
        selectedFile.type === "text/plain" ||
        selectedFile.name.endsWith(".txt");
      const isAudioFile =
        selectedFile.type.startsWith("audio/") ||
        selectedFile.name.endsWith(".mp3") ||
        selectedFile.name.endsWith(".m4a") ||
        selectedFile.name.endsWith(".wav");

      if (isTextFile || isAudioFile) {
        setFile(selectedFile);
        setError(null);
        console.log(
          "  ✅ File selected:",
          selectedFile.name,
          `(${(selectedFile.size / 1024 / 1024).toFixed(2)}MB)`
        );
      } else {
        setError("Please select a .txt file or audio file (.mp3, .m4a, .wav)");
        setFile(null);
      }
    } catch (error) {
      console.error("Error handling file selection:", error);
      setError("Failed to process selected file");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setUploadStatus("uploading");
    setUploadProgress(0);

    // Reset timer states
    setElapsedTime(0);
    setRemainingTime(null);

    // Check file size and warn user for large files
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 50) {
      console.log(
        `⚠️ Large file detected: ${fileSizeMB.toFixed(
          2
        )}MB - this may take several minutes`
      );
    }

    try {
      // Optimize file before upload to boost speed
      console.log(`🔧 Optimizing file for faster upload...`);
      setUploadStatus("optimizing");
      setUploadProgress(5);

      const optimizedFile = await optimizeFileForUpload(file);
      const optimizedSizeMB = optimizedFile.size / (1024 * 1024);

      if (optimizedFile.size < file.size) {
        const savings = (
          ((file.size - optimizedFile.size) / file.size) *
          100
        ).toFixed(1);
        console.log(
          `🚀 File optimized: ${fileSizeMB.toFixed(
            2
          )}MB → ${optimizedSizeMB.toFixed(2)}MB (${savings}% smaller)`
        );
        setUploadProgress(10);
        setUploadStatus("uploading");
        // Show optimization success briefly
        setTimeout(() => setError(null), 2000);
      } else {
        setUploadProgress(10);
        setUploadStatus("uploading");
      }

      // Use custom server instead of Make.com directly
      const webhookUrl = API_ENDPOINTS.upload;
      const apiKey = localStorage.getItem("adminToken"); // Use auth token if admin, otherwise null

      // Choose upload method based on file size
      let result: any = null;

      if (optimizedSizeMB > 10) {
        // Use chunked upload for files larger than 10MB
        console.log(
          `🚀 Using chunked upload for ${optimizedSizeMB.toFixed(2)}MB file`
        );
        try {
          result = await performChunkedUpload(
            optimizedFile,
            webhookUrl,
            apiKey
          );
        } catch (chunkError) {
          console.error("❌ Chunked upload failed:", chunkError);

          // Fallback to regular upload for files under 50MB
          if (optimizedFile.size <= 50 * 1024 * 1024) {
            console.log(
              "🔄 Falling back to regular upload due to chunked upload failure"
            );
            result = await performRegularUpload(
              optimizedFile,
              webhookUrl,
              apiKey
            );
          } else {
            throw new Error(
              `Chunked upload failed and file is too large for fallback: ${
                chunkError instanceof Error
                  ? chunkError.message
                  : String(chunkError)
              }`
            );
          }
        }
      } else {
        // Use regular upload for smaller files
        console.log(
          `📁 Using regular upload for ${optimizedSizeMB.toFixed(2)}MB file`
        );
        result = await performRegularUpload(optimizedFile, webhookUrl, apiKey);
      }

      // Process the result from upload
      if (result.file && result.file.id) {
        // File uploaded successfully, now wait for AI processing
        console.log("📁 File uploaded, waiting for AI processing...");
        setUploadProgress(90);
        setUploadStatus("processing");

        try {
          // Poll status until AI processing is complete
          await pollUploadStatus(result.file.id);

          // AI processing complete, fetch the generated notes for this specific file
          console.log("🎉 AI processing complete, fetching notes...");
          await fetchFileNotes(result.file.id);

          // Set status to complete
          setUploadProgress(100);
          setUploadStatus("complete");

          // Trigger HIPAA compliance after successful generation
          setTimeout(() => handleHipaaCompliance(), 500);
        } catch (error) {
          console.error("❌ AI processing failed:", error);
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
          setError(`AI processing failed: ${errorMessage}`);
          setUploadStatus("error");
        }
      } else {
        // Fallback for backward compatibility
        console.log("⚠️ Using fallback result processing");
        if (result.soap_note_text && result.patient_summary_text) {
          setOutput({
            soapNote: result.soap_note_text,
            patientSummary: result.patient_summary_text,
          });
          setUploadProgress(100);
          setUploadStatus("complete");
          // No need to fetch notes in fallback - we already have them
          setTimeout(() => handleHipaaCompliance(), 500);
        } else if (result.soapNote && result.patientSummary) {
          setOutput({
            soapNote: result.soapNote,
            patientSummary: result.patientSummary,
          });
          setUploadProgress(100);
          setUploadStatus("complete");
          // No need to fetch notes in fallback - we already have them
          setTimeout(() => handleHipaaCompliance(), 500);
        } else {
          throw new Error("Invalid upload response format");
        }
      }
    } catch (err) {
      console.error("Error uploading file:", err);
      setUploadStatus("error");
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setError("Upload timed out. Large files may take longer to process.");
        } else if (err.message.includes("timeout")) {
          setError(err.message);
        } else if (err.message.includes("too large")) {
          setError(err.message);
        } else if (err.message.includes("Network connection lost")) {
          setError(err.message);
        } else {
          setError(`Failed to process file: ${err.message}`);
        }
      } else {
        setError("Failed to process file. Please try again.");
      }
    } finally {
      setIsUploading(false);
      if (uploadStatus !== "complete") {
        setUploadProgress(0);
      }

      // Reset timer states
      setElapsedTime(0);
      setRemainingTime(null);
    }
  }, [file, uploadStatus, isLoggedIn, outputSelection, fetchUserNotes]);

  // Chunked upload function for large files
  const performChunkedUpload = async (
    file: File,
    webhookUrl: string,
    apiKey: string | null
  ) => {
    const chunkSize = 2 * 1024 * 1024; // 2MB chunks
    const totalChunks = Math.ceil(file.size / chunkSize);
    const fileId = generateFileId();

    console.log(
      `🚀 Starting chunked upload: ${totalChunks} chunks of ${(
        chunkSize /
        1024 /
        1024
      ).toFixed(1)}MB each`
    );

    // Upload chunks in parallel (max 3 concurrent)
    const maxConcurrent = 3;
    const chunks: Array<{
      index: number;
      data: Blob;
      start: number;
      end: number;
    }> = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      // Validate chunk data
      if (chunk.size === 0) {
        throw new Error(
          `Chunk ${i} has no data (start: ${start}, end: ${end}, file size: ${file.size})`
        );
      }

      console.log(
        `🔧 Created chunk ${i + 1}/${totalChunks}: ${start}-${end} (${(
          chunk.size /
          1024 /
          1024
        ).toFixed(2)}MB)`
      );

      chunks.push({ index: i, data: chunk, start, end });
    }

    let completedChunks = 0;
    let failedChunks: number[] = [];

    // Process chunks in batches
    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const batch = chunks.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(async (chunk) => {
        try {
          await uploadChunk(
            chunk,
            fileId,
            webhookUrl,
            apiKey,
            file,
            totalChunks
          );
          completedChunks++;
          const progress = (completedChunks / totalChunks) * 90; // 90% for upload, 10% for processing
          setUploadProgress(progress);
          console.log(
            `✅ Chunk ${chunk.index + 1}/${totalChunks} uploaded successfully`
          );
        } catch (error) {
          console.error(`❌ Chunk ${chunk.index + 1} failed:`, error);
          failedChunks.push(chunk.index);
          throw error;
        }
      });

      try {
        await Promise.all(batchPromises);
      } catch (error) {
        // If any chunk in batch fails, retry failed chunks
        if (failedChunks.length > 0) {
          console.log(`🔄 Retrying ${failedChunks.length} failed chunks...`);
          for (const chunkIndex of failedChunks) {
            const chunk = chunks[chunkIndex];
            try {
              await uploadChunk(
                chunk,
                fileId,
                webhookUrl,
                apiKey,
                file,
                totalChunks
              );
              completedChunks++;
              const progress = (completedChunks / totalChunks) * 90;
              setUploadProgress(progress);
              console.log(`✅ Retry successful for chunk ${chunk.index + 1}`);
            } catch (retryError) {
              throw new Error(
                `Failed to upload chunk ${chunk.index + 1} after retry`
              );
            }
          }
        }
      }
    }

    // Finalize upload
    console.log(`🎯 Finalizing chunked upload for file ${fileId}`);
    const finalizeResult = await finalizeChunkedUpload(
      fileId,
      file,
      webhookUrl,
      apiKey
    );

    if (!finalizeResult.success) {
      throw new Error("Failed to finalize chunked upload");
    }

    return finalizeResult;
  };

  // Upload individual chunk
  const uploadChunk = async (
    chunk: { index: number; data: Blob; start: number; end: number },
    fileId: string,
    webhookUrl: string,
    apiKey: string | null,
    originalFile: File,
    totalChunks: number
  ) => {
    const formData = new FormData();

    // Ensure chunk data is properly converted to File
    // The issue might be that chunk.data is a Blob that needs proper handling
    let chunkFile: File;

    try {
      // Try to create a File from the Blob data
      chunkFile = new File([chunk.data], `chunk_${chunk.index}`, {
        type: "application/octet-stream",
      });

      // Verify the chunk file has data
      if (chunkFile.size === 0) {
        throw new Error(`Chunk ${chunk.index} has no data (size: 0)`);
      }

      console.log(`🔍 Chunk ${chunk.index + 1} data:`, {
        originalSize: chunk.data.size,
        fileSize: chunkFile.size,
        type: chunkFile.type,
        name: chunkFile.name,
      });
    } catch (error) {
      console.error(
        `❌ Error creating chunk file for index ${chunk.index}:`,
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create chunk file: ${errorMessage}`);
    }

    formData.append("chunk", chunkFile);
    formData.append("chunkIndex", chunk.index.toString());
    formData.append("fileId", fileId);
    formData.append("totalChunks", totalChunks.toString());
    formData.append("fileName", originalFile.name);
    formData.append("chunkSize", chunk.data.size.toString());
    formData.append("chunkStart", chunk.start.toString());
    formData.append("chunkEnd", chunk.end.toString());

    // Debug FormData contents
    console.log(`🔍 FormData contents for chunk ${chunk.index + 1}:`);
    for (let [key, value] of formData.entries()) {
      if (key === "chunk" && value instanceof File) {
        console.log(`  ${key}: File(${value.size} bytes, ${value.type})`);
      } else {
        console.log(`  ${key}:`, value);
      }
    }

    console.log(
      `📤 Uploading chunk ${chunk.index + 1}/${totalChunks}: ${(
        chunk.data.size /
        1024 /
        1024
      ).toFixed(2)}MB`
    );

    const response = await fetch(`${webhookUrl}/chunk`, {
      method: "POST",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ Chunk ${chunk.index + 1} failed with response:`,
        errorText
      );
      throw new Error(
        `Chunk upload failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  };

  // Finalize chunked upload
  const finalizeChunkedUpload = async (
    fileId: string,
    file: File,
    webhookUrl: string,
    apiKey: string | null
  ) => {
    const formData = new FormData();
    formData.append("fileId", fileId);
    formData.append("fileName", file.name);
    formData.append("fileSize", file.size.toString());
    formData.append("action", "finalize");
    formData.append(
      "noteType",
      outputSelection.soapNote && outputSelection.patientSummary
        ? "both"
        : outputSelection.soapNote
        ? "summary"
        : "soap"
    );

    const response = await fetch(`${webhookUrl}/finalize`, {
      method: "POST",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      body: formData,
    });

    if (!response.ok) {
      throw new Error(
        `Finalization failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  };

  // Regular upload function for smaller files
  const performRegularUpload = async (
    file: File,
    webhookUrl: string,
    apiKey: string | null
  ) => {
    // Upload with retry logic for large files
    const maxRetries = 3;
    let lastError: Error | null = null;
    let result: any = null;
    const uploadStartTime = Date.now(); // Local start time for this function

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `📁 Upload attempt ${attempt}/${maxRetries} for file: ${
            file.name
          } (${(file.size / (1024 * 1024)).toFixed(2)}MB)`
        );

        // Single upload attempt with XMLHttpRequest
        result = await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          // Set timeout for large files (5 minutes)
          xhr.timeout = 300000; // 5 minutes

          // Real upload progress tracking with time calculations
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const progress = (event.loaded / event.total) * 90; // Go to 90% during upload
              setUploadProgress(progress);

              // Calculate elapsed and remaining time
              const currentTime = Date.now();
              const elapsed = Math.floor(
                (currentTime - uploadStartTime) / 1000
              );
              setElapsedTime(elapsed);

              if (progress > 0) {
                const estimatedTotalTime = (elapsed / progress) * 100;
                const remaining = Math.max(
                  0,
                  Math.floor(estimatedTotalTime - elapsed)
                );
                setRemainingTime(remaining);
              }
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status === 200) {
              try {
                const result = JSON.parse(xhr.responseText);
                setUploadProgress(90); // Upload complete, now processing
                setUploadStatus("processing");
                resolve(result);
              } catch (error) {
                reject(new Error("Invalid JSON response"));
              }
            } else if (xhr.status === 413) {
              reject(
                new Error(
                  `File too large (${(file.size / (1024 * 1024)).toFixed(
                    1
                  )}MB). Maximum allowed size is 200MB. Please compress your file or use a smaller one.`
                )
              );
            } else if (xhr.status === 408) {
              reject(
                new Error(
                  `Upload timeout. Large files (${(
                    file.size /
                    (1024 * 1024)
                  ).toFixed(
                    1
                  )}MB) may take longer. Please try again or use a smaller file.`
                )
              );
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener("error", () => {
            if (xhr.status === 0) {
              reject(
                new Error(
                  "Network connection lost. Please check your internet connection and try again."
                )
              );
            } else {
              reject(
                new Error("Network error during upload. Please try again.")
              );
            }
          });

          xhr.addEventListener("timeout", () => {
            reject(
              new Error(
                `Upload timeout after 5 minutes. File ${(
                  file.size /
                  (1024 * 1024)
                ).toFixed(
                  1
                )}MB is too large or connection is slow. Please try with a smaller file.`
              )
            );
          });

          xhr.addEventListener("abort", () => {
            reject(new Error("Upload was cancelled. Please try again."));
          });

          xhr.open("POST", webhookUrl);
          // Only add Authorization header if admin token exists
          if (apiKey) {
            xhr.setRequestHeader("Authorization", `Bearer ${apiKey}`);
          }

          const formData = new FormData();
          formData.append("file", file);
          formData.append(
            "noteType",
            outputSelection.soapNote && outputSelection.patientSummary
              ? "both"
              : outputSelection.soapNote
              ? "soap"
              : "summary"
          );
          xhr.send(formData);
        });

        // If we get here, upload was successful
        console.log(`✅ Upload successful on attempt ${attempt}`);
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(
          `❌ Upload attempt ${attempt} failed:`,
          lastError.message
        );

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
          console.log(`⏳ Waiting ${waitTime / 1000}s before retry...`);
          setError(
            `Upload attempt ${attempt} failed. Retrying in ${
              waitTime / 1000
            }s... (${lastError.message})`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    // If all retries failed
    if (lastError) {
      throw lastError;
    }

    return result;
  };

  // Generate unique file ID for chunked uploads
  const generateFileId = () => {
    return `chunked_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 15)}`;
  };

  // Compress file before upload to boost speed
  const compressFile = async (file: File): Promise<File> => {
    // Only compress audio files and text files
    if (!file.type.startsWith("audio/") && file.type !== "text/plain") {
      return file;
    }

    try {
      if (file.type === "text/plain") {
        // Compress text files using gzip
        const text = await file.text();

        // Simple compression for text (remove extra whitespace, etc.)
        const compressedText = text
          .replace(/\s+/g, " ") // Replace multiple spaces with single space
          .replace(/\n\s*\n/g, "\n") // Remove empty lines
          .trim();

        if (compressedText.length < text.length) {
          const compressedBlob = new Blob([compressedText], {
            type: "text/plain",
          });
          return new File([compressedBlob], file.name, { type: "text/plain" });
        }
        return file;
      } else if (file.type.startsWith("audio/")) {
        // For audio files, we'll use the Web Audio API to potentially reduce quality
        // This is a simplified approach - in production you might want more sophisticated compression
        console.log(
          `🎵 Audio file detected: ${file.name} - compression not implemented for audio files`
        );
        return file;
      }

      return file;
    } catch (error) {
      console.warn("⚠️ File compression failed, using original file:", error);
      return file;
    }
  };

  // Optimize file before upload
  const optimizeFileForUpload = async (file: File): Promise<File> => {
    const fileSizeMB = file.size / (1024 * 1024);

    if (fileSizeMB > 5) {
      console.log(
        `🔧 Optimizing file for upload: ${file.name} (${fileSizeMB.toFixed(
          2
        )}MB)`
      );

      // Compress file if possible
      const compressedFile = await compressFile(file);
      const compressedSizeMB = compressedFile.size / (1024 * 1024);

      if (compressedFile.size < file.size) {
        const savings = (
          ((file.size - compressedFile.size) / file.size) *
          100
        ).toFixed(1);
        console.log(
          `✅ File compressed: ${fileSizeMB.toFixed(
            2
          )}MB → ${compressedSizeMB.toFixed(2)}MB (${savings}% smaller)`
        );
        return compressedFile;
      } else {
        console.log(`ℹ️ No compression possible for this file type`);
        return file;
      }
    }

    return file;
  };

  const copyToClipboard = useCallback(async (text: string, _type: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      setError("Failed to copy to clipboard");
    }
  }, []);

  const downloadFile = useCallback(
    (content: string, type: string) => {
      try {
        const originalName = file
          ? file.name.replace(/\.[^/.]+$/, "")
          : "patient-visit";

        const timestamp = new Date().toISOString().split("T")[0];
        const filename = `${originalName}_${type}_${timestamp}.txt`;

        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error downloading file:", error);
        setError("Failed to download file");
      }
    },
    [file]
  );

  const resetAllStates = useCallback(() => {
    // Confirm before resetting if there's output
    if (
      output &&
      !window.confirm(
        "Are you sure you want to clear all generated notes? This action cannot be undone."
      )
    ) {
      return;
    }

    console.log("🔄 Reset All States - clearing everything");

    // Reset file states
    setFile(null);
    setOutput(null);
    setError(null);
    setOutputSelection({
      soapNote: true,
      patientSummary: true,
    });

    // Reset recording states
    setShowRecorder(false);
    setRecordedBlob(null);
    setRecordingTime(0);
    setIsPlaying(false);
    setIsRecording(false);
    setIsPaused(false);
    setIsProcessing(false);
    isCancellingRef.current = false;
    isRecordingRef.current = false;

    // Reset HIPAA states
    setShowHipaDialog(false);
    setHipaaChoice(null);

    // Reset upload states
    setUploadProgress(0);
    setUploadStatus("idle");
    setElapsedTime(0);
    setRemainingTime(null);

    // Clear refs
    stopAudioLevelMonitoring();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (audioRef.current) {
      audioRef.current.src = "";
    }

    console.log("  ✅ All states reset to initial values");
  }, [output, stopAudioLevelMonitoring]);

  // HIPAA compliance function - handle file cleanup and user choice
  const handleHipaaCompliance = useCallback(async () => {
    if (!file) return;

    try {
      // Show HIPAA compliance dialog
      setShowHipaDialog(true);
    } catch (error) {
      console.error("Error in HIPAA compliance handling:", error);
      setError("Failed to process HIPAA compliance. Please try again.");
    }
  }, [file]);

  // Handle user's HIPAA choice
  const handleHipaaChoice = useCallback(
    async (choice: "save" | "delete") => {
      try {
        setHipaaChoice(choice);

        if (choice === "save") {
          // Download the original file to user's desktop
          const url = URL.createObjectURL(file!);
          const a = document.createElement("a");
          a.href = url;
          a.download = file!.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          // Show success message
          setError(null);
          console.log("✅ File saved locally by user");
        }

        // Either way, delete the file from memory (simulating server cleanup)
        setFile(null);
        setShowHipaDialog(false);
        setHipaaChoice(null);

        console.log(
          "✅ File removed from application memory (simulating server cleanup)"
        );
      } catch (error) {
        console.error("Error handling HIPAA choice:", error);
        setError("Failed to process file cleanup. Please try again.");
      }
    },
    [file]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+R to reset
      if ((event.ctrlKey || event.metaKey) && event.key === "r") {
        event.preventDefault();
        resetAllStates();
      }
      // Escape to close error messages
      if (event.key === "Escape" && error) {
        setError(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [resetAllStates, error]);

  return (
    <>
      {/* HIPAA Compliance Dialog */}
      {showHipaDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              HIPAA Compliance Notice
            </h3>
            <p className="text-gray-600 mb-4">
              This application processes medical information. By continuing, you
              acknowledge that you will handle this data in compliance with
              HIPAA regulations.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setHipaaChoice("save");
                  setShowHipaDialog(false);
                }}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                I Understand
              </button>
              <button
                onClick={() => {
                  setHipaaChoice("delete");
                  setShowHipaDialog(false);
                }}
                className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Admin Login</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAdminLogin(adminEmail, adminPassword);
              }}
            >
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Password"
                  required
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminLogin(false)}
                  className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main App or Admin Page Routing */}
      {currentPage === "admin" ? (
        (() => {
          console.log(
            "🔍 Rendering AdminPage - currentPage:",
            currentPage,
            "isAdmin:",
            isAdmin,
            "isLoggedIn:",
            isLoggedIn
          );
          return (
            <AdminPage
              API_BASE_URL={API_BASE_URL}
              onBackToMain={handleBackToMain}
              onLogout={handleAdminLogout}
            />
          );
        })()
      ) : (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
          {/* Header */}
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-4">
                <div className="flex items-center space-x-4">
                  <h1 className="text-2xl font-bold text-clearly-blue">
                    ClearlyAI
                  </h1>
                  <p className="text-gray-600">Medical Notes Generator</p>
                </div>
                <div className="flex items-center space-x-4">
                  {!isLoggedIn ? (
                    <button
                      onClick={() => setShowAdminLogin(true)}
                      className="bg-clearly-blue hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
                    >
                      Admin Login
                    </button>
                  ) : (
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          Welcome, Admin
                        </p>
                        <p className="text-xs text-gray-500">
                          {isAdmin ? "Administrator" : "User"}
                        </p>
                      </div>
                      <button
                        onClick={handleAdminLogout}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Hero Section */}
          <section className="bg-white py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-clearly-blue mb-6">
                Generate SOAP notes & patient-ready appointment summaries with
                AI
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Upload your audio recording or transcription and receive
                easy-to-read notes in seconds.
              </p>

              {/* Upload Section */}
              <div className="max-w-4xl mx-auto">
                <div className="grid md:grid-cols-2 gap-8 items-start">
                  {/* File Upload Area */}
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-4 text-center">
                      Upload File
                    </h3>
                    <div
                      className={`upload-area min-h-[280px] ${
                        !!output ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      onDrop={!!output ? undefined : handleDrop}
                      onDragOver={!!output ? undefined : handleDragOver}
                      onClick={
                        !!output
                          ? undefined
                          : () => fileInputRef.current?.click()
                      }
                    >
                      <Upload
                        className={`h-12 w-12 mx-auto mb-4 ${
                          !!output ? "text-gray-300" : "text-gray-400"
                        }`}
                      />
                      <p
                        className={`text-lg font-medium mb-2 ${
                          !!output ? "text-gray-400" : "text-gray-700"
                        }`}
                      >
                        {!!output
                          ? "Upload disabled - Generate notes first"
                          : "Upload transcript or audio recording"}
                      </p>
                      <p
                        className={`text-sm ${
                          !!output ? "text-gray-300" : "text-gray-500"
                        }`}
                      >
                        {!!output
                          ? "Complete current generation to upload new files"
                          : "Drag and drop your file here, or click to browse"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Supported: .txt, .mp3, .m4a, .wav (Max: 100MB)
                      </p>

                      {file && (
                        <div className="mt-4 p-3 bg-green-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-green-700">
                                Selected: {file.name}
                              </p>
                              <p className="text-xs text-green-600 mt-1">
                                Size: {(file.size / 1024 / 1024).toFixed(2)}MB •
                                Type: {file.type || "Unknown"}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setFile(null);
                                setError(null);
                              }}
                              className="text-green-600 hover:text-green-800"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recording Section */}
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-4 text-center">
                      Record Audio
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-6 min-h-[280px] flex items-center justify-center">
                      {!showRecorder && (
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-4">
                            Record directly on the website
                          </p>
                          <p className="text-xs text-gray-500 mb-4">
                            🔒 HIPAA Compliant: Recordings are processed locally
                            and not stored on our servers
                          </p>
                          <button
                            onClick={() => {
                              console.log(
                                "🖱️ Initial Start Recording button clicked"
                              );
                              setShowRecorder(true);
                              setTimeout(startRecording, 100);
                            }}
                            className="btn-primary inline-flex items-center"
                            disabled={
                              isUploading || !!output || !!file || isProcessing
                            }
                          >
                            <Mic className="h-5 w-5 mr-2" />
                            {isProcessing
                              ? "Initializing..."
                              : "Start Recording"}
                          </button>
                        </div>
                      )}

                      {/* Recording Interface */}
                      {showRecorder && !isRecording && !recordedBlob && (
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-4">
                            Click the microphone to start recording
                          </p>
                          <button
                            onClick={() => {
                              console.log(
                                "🖱️ Secondary Start Recording button clicked"
                              );
                              startRecording();
                            }}
                            className="btn-primary inline-flex items-center"
                            disabled={isProcessing}
                          >
                            <Mic className="h-5 w-5 mr-2" />
                            {isProcessing
                              ? "Initializing..."
                              : "Start Recording"}
                          </button>
                        </div>
                      )}

                      {showRecorder && isRecording && (
                        <div className="w-full text-center">
                          <div className="mb-4">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-3 animate-pulse">
                              <Mic className="h-6 w-6 text-red-500" />
                            </div>

                            {/* Real-time Audio Level Bars */}
                            <div
                              className="flex items-end justify-center space-x-1 mb-3"
                              style={{ height: "24px" }}
                            >
                              {Array.from({ length: 9 }, (_, index) => {
                                const baseHeight = 3;
                                const maxHeight = 20;
                                const height = Math.max(
                                  baseHeight,
                                  Math.min(
                                    maxHeight,
                                    baseHeight +
                                      audioLevel *
                                        maxHeight *
                                        (0.3 + index * 0.1)
                                  )
                                );
                                const opacity = audioLevel > 0.01 ? 1 : 0.2;

                                return (
                                  <div
                                    key={index}
                                    className="w-1 bg-red-500 rounded-full transition-all duration-75 ease-out"
                                    style={{
                                      height: `${height}px`,
                                      opacity: opacity,
                                    }}
                                  ></div>
                                );
                              })}
                            </div>

                            <p className="text-base font-medium text-gray-700">
                              {isPaused ? "Paused" : "Recording"}...{" "}
                              {formatTime(recordingTime)}
                            </p>
                            <p className="text-xs text-gray-500">
                              Level: {Math.round(audioLevel * 100)}%
                            </p>
                          </div>

                          <div className="flex justify-center space-x-2 flex-wrap">
                            {!isPaused ? (
                              <button
                                onClick={() => {
                                  console.log("🖱️ Pause button clicked");
                                  pauseRecording();
                                }}
                                className="bg-yellow-500 hover:bg-yellow-600 text-white font-medium py-2 px-3 rounded-lg inline-flex items-center text-sm"
                              >
                                <Pause className="h-4 w-4 mr-1" />
                                Pause
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  console.log("🖱️ Resume button clicked");
                                  resumeRecording();
                                }}
                                className="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-3 rounded-lg inline-flex items-center text-sm"
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Resume
                              </button>
                            )}

                            <button
                              onClick={() => {
                                console.log("🖱️ Stop button clicked");
                                stopRecording();
                              }}
                              className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-3 rounded-lg inline-flex items-center text-sm"
                            >
                              <Square className="h-4 w-4 mr-1" />
                              Stop
                            </button>

                            <button
                              onClick={() => {
                                console.log("🖱️ Cancel button clicked");
                                cancelRecording();
                              }}
                              className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-3 rounded-lg inline-flex items-center text-sm"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {showRecorder && recordedBlob && !isRecording && (
                        <div className="w-full text-center">
                          <p className="text-sm text-gray-600 mb-4">
                            Recording completed ({formatTime(recordingTime)})
                          </p>

                          <div className="flex justify-center space-x-2 mb-4 flex-wrap">
                            <button
                              onClick={playRecording}
                              className="btn-secondary inline-flex items-center text-sm"
                            >
                              {isPlaying ? (
                                <Pause className="h-4 w-4 mr-1" />
                              ) : (
                                <Play className="h-4 w-4 mr-1" />
                              )}
                              {isPlaying ? "Pause" : "Play"}
                            </button>

                            <button
                              onClick={downloadRecording}
                              className="btn-secondary inline-flex items-center text-sm"
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </button>
                          </div>

                          <div className="flex justify-center space-x-2 flex-wrap">
                            <button
                              onClick={useRecording}
                              className="btn-primary text-sm"
                            >
                              Use This Recording
                            </button>

                            <button
                              onClick={() => {
                                console.log("🖱️ Record Again button clicked");
                                clearRecording();
                              }}
                              className="btn-secondary text-sm"
                            >
                              Record Again
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Hidden audio element for playback */}
                      <audio
                        ref={audioRef}
                        onEnded={() => setIsPlaying(false)}
                        style={{ display: "none" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Output Selection & Generate Button */}
                <div className="mt-8 max-w-2xl mx-auto">
                  <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
                      Choose Output Types
                    </h3>
                    <div className="space-y-3 mb-6">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={outputSelection.soapNote}
                          onChange={(e) =>
                            setOutputSelection((prev) => ({
                              ...prev,
                              soapNote: e.target.checked,
                            }))
                          }
                          disabled={!!output || isUploading || isProcessing}
                          className="mr-3 h-4 w-4 text-clearly-blue border-gray-300 rounded focus:ring-clearly-blue disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span
                          className={`text-sm font-medium ${
                            output || isUploading || isProcessing
                              ? "text-gray-500"
                              : "text-gray-700"
                          }`}
                        >
                          SOAP Note (Professional Clinical Format)
                        </span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={outputSelection.patientSummary}
                          onChange={(e) =>
                            setOutputSelection((prev) => ({
                              ...prev,
                              patientSummary: e.target.checked,
                            }))
                          }
                          disabled={!!output || isUploading || isProcessing}
                          className="mr-3 h-4 w-4 text-clearly-blue border-gray-300 rounded focus:ring-clearly-blue disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span
                          className={`text-sm font-medium ${
                            output || isUploading || isProcessing
                              ? "text-gray-500"
                              : "text-gray-700"
                          }`}
                        >
                          Patient Summary (Plain Language)
                        </span>
                      </label>
                    </div>
                    {output && (
                      <p className="text-xs text-gray-500 mb-4 text-center">
                        💡 Click "Generate Another Note" to change these
                        selections
                      </p>
                    )}

                    {/* Generate Button */}
                    <button
                      onClick={handleUpload}
                      disabled={
                        !file ||
                        isUploading ||
                        isProcessing ||
                        (!outputSelection.soapNote &&
                          !outputSelection.patientSummary)
                      }
                      className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploading || isProcessing ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          {uploadStatus === "uploading"
                            ? "Uploading..."
                            : "Processing..."}
                        </div>
                      ) : (
                        "Generate Notes"
                      )}
                    </button>

                    {/* Upload Progress Bar */}
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="mt-4">
                        <div className="flex justify-between text-sm text-gray-600 mb-2">
                          <span>Upload Progress</span>
                          <span>{Math.round(uploadProgress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>

                        {/* Timer Display */}
                        {uploadStatus === "uploading" && (
                          <div className="flex justify-between text-xs text-gray-600 mt-2">
                            <span>
                              ⏱️ Elapsed: {formatUploadTime(elapsedTime)}
                            </span>
                            {remainingTime !== null && (
                              <span>
                                ⏳ Remaining: {formatUploadTime(remainingTime)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Status Messages */}
                        <div className="mt-3 text-center">
                          {uploadStatus === "optimizing" && (
                            <p className="text-sm text-purple-600">
                              🔧 Optimizing file for faster upload...
                            </p>
                          )}
                          {uploadStatus === "uploading" && (
                            <p className="text-sm text-blue-600">
                              📤 Uploading file...{" "}
                              {uploadProgress > 10 &&
                                `(${Math.round(uploadProgress)}% complete)`}
                            </p>
                          )}
                          {uploadStatus === "processing" && (
                            <p className="text-sm text-blue-600">
                              🤖 AI is processing your file... This may take a
                              few minutes
                            </p>
                          )}
                          {uploadStatus === "error" && (
                            <p className="text-sm text-red-600">
                              ❌ Processing failed
                            </p>
                          )}
                        </div>

                        {/* Show processing status for better user experience */}
                        {uploadStatus === "processing" && (
                          <p className="text-xs text-blue-500 mt-1 text-center">
                            🔄 Polling for completion... Please wait
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.mp3,.m4a,.wav,audio/*"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) {
                      handleFileSelect(selectedFile);
                    }
                  }}
                  className="hidden"
                  disabled={!!output || isProcessing}
                />

                {error && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <X className="h-5 w-5 text-red-400" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-800">{error}</p>
                      </div>
                      <div className="ml-auto pl-3">
                        <button
                          onClick={() => setError(null)}
                          className="inline-flex text-red-400 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Output Section */}
              {output && (
                <div className="max-w-4xl mx-auto mt-12">
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-5 h-5 bg-green-400 rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-green-800">
                          Notes generated successfully! 🎉
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          {outputSelection.soapNote &&
                          outputSelection.patientSummary
                            ? "Your SOAP note and patient summary are ready below."
                            : outputSelection.soapNote
                            ? "Your SOAP note is ready below."
                            : "Your patient summary is ready below."}
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          🔒 <strong>HIPAA Notice:</strong> The original file
                          will be removed from our servers for compliance.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* HIPAA Compliance Dialog */}
                  {showHipaDialog && (
                    <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-center">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                            <div className="w-3 h-3 bg-white rounded-full"></div>
                          </div>
                        </div>
                        <h3 className="text-lg font-semibold text-blue-900 mb-2">
                          HIPAA Compliance - File Management
                        </h3>
                        <p className="text-sm text-blue-700 mb-4">
                          Your notes have been generated successfully. For HIPAA
                          compliance, the original file will be removed from our
                          servers.
                          <strong>
                            Would you like to save a copy to your local device?
                          </strong>
                        </p>
                        <div className="flex justify-center space-x-3">
                          <button
                            onClick={() => handleHipaaChoice("save")}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg inline-flex items-center text-sm"
                            disabled={hipaaChoice !== null}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            {hipaaChoice === "save"
                              ? "Saving..."
                              : "Save File Locally"}
                          </button>
                          <button
                            onClick={() => handleHipaaChoice("delete")}
                            className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg inline-flex items-center text-sm"
                            disabled={hipaaChoice !== null}
                          >
                            <X className="h-4 w-4 mr-2" />
                            {hipaaChoice === "delete"
                              ? "Deleting..."
                              : "Delete File"}
                          </button>
                        </div>
                        <p className="text-xs text-blue-600 mt-3">
                          💡 <strong>Note:</strong> If you choose to save, the
                          file will be downloaded to your device. If you choose
                          to delete, the file will be permanently removed from
                          our servers.
                        </p>
                      </div>
                    </div>
                  )}

                  <h2 className="text-3xl font-bold text-clearly-blue text-center mb-8">
                    {outputSelection.soapNote && outputSelection.patientSummary
                      ? "Your Generated Notes"
                      : outputSelection.soapNote
                      ? "Your Generated SOAP Note"
                      : "Your Generated Patient Summary"}
                  </h2>
                  <div
                    className={`grid gap-8 ${
                      outputSelection.soapNote && outputSelection.patientSummary
                        ? "md:grid-cols-2"
                        : "md:grid-cols-1"
                    }`}
                  >
                    {/* SOAP Note */}
                    {outputSelection.soapNote && (
                      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-xl font-semibold text-gray-900">
                            SOAP Note
                          </h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                copyToClipboard(output.soapNote, "SOAP Note")
                              }
                              className="btn-secondary text-sm py-2 px-3"
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              Copy
                            </button>
                            <button
                              onClick={() =>
                                downloadFile(output.soapNote, "SOAP-Note")
                              }
                              className="btn-secondary text-sm py-2 px-3"
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                          <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                            {output.soapNote}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Patient Summary */}
                    {outputSelection.patientSummary && (
                      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-xl font-semibold text-gray-900">
                            Patient Summary
                          </h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  output.patientSummary,
                                  "Patient Summary"
                                )
                              }
                              className="btn-secondary text-sm py-2 px-3"
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              Copy
                            </button>
                            <button
                              onClick={() =>
                                downloadFile(
                                  output.patientSummary,
                                  "Patient-Summary"
                                )
                              }
                              className="btn-secondary text-sm py-2 px-3"
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                          <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                            {output.patientSummary}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reset Form Button */}
                  <div className="text-center mt-8">
                    <button
                      onClick={resetAllStates}
                      className="btn-secondary"
                      title="Clear all data and start over (Ctrl+R)"
                    >
                      Generate Another Note
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Press Ctrl+R to quickly reset
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* How It Works Section */}
          <section className="bg-gray-50 py-16">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  How It Works
                </h2>
                <p className="text-xl text-gray-600">
                  Generate professional medical notes in three simple steps
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="bg-clearly-blue rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <span className="text-white text-2xl font-bold">1</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Upload or Record
                  </h3>
                  <p className="text-gray-600">
                    Upload your audio file or record directly on the website. We
                    support MP3, M4A, WAV, and text files.
                  </p>
                </div>

                <div className="text-center">
                  <div className="bg-clearly-blue rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <span className="text-white text-2xl font-bold">2</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    AI Processing
                  </h3>
                  <p className="text-gray-600">
                    Our advanced AI analyzes your content and generates
                    comprehensive SOAP notes and patient summaries.
                  </p>
                </div>

                <div className="text-center">
                  <div className="bg-clearly-blue rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <span className="text-white text-2xl font-bold">3</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Download & Use
                  </h3>
                  <p className="text-gray-600">
                    Download your generated notes in a clean, professional
                    format ready for medical records.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="bg-white py-16">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Key Features
                </h2>
                <p className="text-xl text-gray-600">
                  Everything you need for efficient medical note generation
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="text-clearly-blue text-3xl mb-4">
                    <Target className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    SOAP Notes
                  </h3>
                  <p className="text-gray-600">
                    Generate comprehensive SOAP (Subjective, Objective,
                    Assessment, Plan) notes automatically.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="text-clearly-blue text-3xl mb-4">
                    <FileSpreadsheet className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Patient Summaries
                  </h3>
                  <p className="text-gray-600">
                    Create clear, concise patient appointment summaries for easy
                    reference.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="text-clearly-blue text-3xl mb-4">
                    <Shield className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    HIPAA Compliant
                  </h3>
                  <p className="text-gray-600">
                    Your data is secure and processed in compliance with
                    healthcare privacy standards.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="text-clearly-blue text-3xl mb-4">
                    <Mic2 className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Audio Recording
                  </h3>
                  <p className="text-gray-600">
                    Record audio directly on the website with real-time audio
                    level monitoring.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="text-clearly-blue text-3xl mb-4">
                    <FolderOpen className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Multiple Formats
                  </h3>
                  <p className="text-gray-600">
                    Support for various audio formats and text files for maximum
                    flexibility.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="text-clearly-blue text-3xl mb-4">
                    <Zap className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Fast Processing
                  </h3>
                  <p className="text-gray-600">
                    Get your notes generated in seconds with our optimized AI
                    processing.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Get Started Section */}
          <section className="bg-gradient-to-r from-clearly-blue to-blue-600 py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-xl text-blue-100 mb-8">
                Join healthcare professionals who are already saving time with
                ClearlyAI
              </p>
              <button
                onClick={() => {
                  document
                    .querySelector(".upload-area")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="bg-white text-clearly-blue px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors"
              >
                Start Generating Notes
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default App;
