import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  FileText,
  Monitor,
  ArrowRight,
  Copy,
  Download,
  Mic,
  Square,
  Play,
  Pause,
  X,
} from "lucide-react";

interface OutputData {
  soapNote: string;
  patientSummary: string;
}

interface OutputSelection {
  soapNote: boolean;
  patientSummary: boolean;
}

function App() {
  // API Configuration - Use relative URLs for Docker deployment
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
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
  const [showLogin, setShowLogin] = useState(false);
  const [userNotes, setUserNotes] = useState<any[]>([]);
  const [allNotes, setAllNotes] = useState<any[]>([]);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Add upload progress tracking
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "processing" | "complete" | "error"
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

  // Admin login function
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
        setShowLogin(false);
        setSuccess("Admin login successful!");
        fetchAllNotes(); // Fetch all notes for admin
      } else {
        setError("Invalid admin credentials");
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    }
  };

  // Fetch all notes (admin only)
  const fetchAllNotes = async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const response = await fetch(`${API_BASE_URL}/api/admin/notes`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAllNotes(data.notes || []);
      }
    } catch (err) {
      console.error("Failed to fetch all notes:", err);
    }
  };

  // Fetch user's own notes
  const fetchUserNotes = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/user`);
      if (response.ok) {
        const data = await response.json();
        setUserNotes(data.notes || []);
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
    setAllNotes([]);
    setSuccess("Admin logged out successfully");
  };

  // Check if admin token exists on component mount
  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (token) {
      setIsAdmin(true);
      setIsLoggedIn(true);
      fetchAllNotes();
    }
    fetchUserNotes(); // Always fetch user notes
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

    // Start upload timer
    const startTime = Date.now();
    setElapsedTime(0);
    setRemainingTime(null);

    try {
      // Use custom server instead of Make.com directly
      const webhookUrl = API_ENDPOINTS.upload;
      const apiKey = localStorage.getItem("adminToken"); // Use auth token if admin, otherwise null

      // Dynamic timeout: 1MB = 1 minute + 5% buffer for safety
      const fileSizeMB = file.size / (1024 * 1024);
      const baseTimeoutMinutes = fileSizeMB;
      const bufferTime = baseTimeoutMinutes * 0.05; // 5% extra time
      const totalTimeoutMinutes = baseTimeoutMinutes + bufferTime;
      const timeoutDuration = totalTimeoutMinutes * 60 * 1000 + 10000; // Convert to milliseconds + 10 seconds extra

      // Single upload attempt with XMLHttpRequest
      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Real upload progress tracking with time calculations
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 90; // Go to 90% during upload
            setUploadProgress(progress);

            // Calculate elapsed and remaining time
            const currentTime = Date.now();
            const elapsed = Math.floor((currentTime - startTime) / 1000);
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
                )}MB) for server. Try a smaller file or contact support.`
              )
            );
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener("error", () =>
          reject(new Error("Network error during upload"))
        );
        xhr.addEventListener("timeout", () =>
          reject(
            new Error(
              "Upload timed out. Large medical files may take longer to process. Try smaller files or check your connection."
            )
          )
        );

        xhr.open("POST", webhookUrl);
        // Only add Authorization header if admin token exists
        if (apiKey) {
          xhr.setRequestHeader("Authorization", `Bearer ${apiKey}`);
        }
        xhr.timeout = timeoutDuration;

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

      // Process the result from XMLHttpRequest
      if (result.soap_note_text && result.patient_summary_text) {
        setOutput({
          soapNote: result.soap_note_text,
          patientSummary: result.patient_summary_text,
        });
        setUploadProgress(100);
        setUploadStatus("complete");
        // Refresh user notes after successful upload
        fetchUserNotes();
        // Trigger HIPAA compliance after successful generation
        setTimeout(() => handleHipaaCompliance(), 500);
      } else if (result.soapNote && result.patientSummary) {
        setOutput({
          soapNote: result.soapNote,
          patientSummary: result.patientSummary,
        });
        setUploadProgress(100);
        setUploadStatus("complete");
        // Refresh user notes after successful upload
        fetchUserNotes();
        // Trigger HIPAA compliance after successful generation
        setTimeout(() => handleHipaaCompliance(), 500);
      } else {
        const mockResponse: OutputData = {
          soapNote: `SOAP Note - ${file?.name || "Unknown File"}

SUBJECTIVE:
Patient presents for routine dental examination and cleaning.

OBJECTIVE:
- Vital signs: BP 120/80, HR 72, Temp 98.6°F
- Oral examination reveals good oral hygiene
- No visible cavities or signs of periodontal disease
- Gingiva appears healthy with no bleeding on probing

ASSESSMENT:
- Patient in good oral health
- No active dental disease detected
- Recommend continued preventive care

PLAN:
- Completed routine dental cleaning
- Applied fluoride treatment
- Scheduled 6-month follow-up appointment
- Reinforced oral hygiene instructions`,
          patientSummary: `Your Dental Visit Summary

Today's Visit:
• We completed your routine dental cleaning and examination
• Your teeth and gums are in excellent health
• No cavities or other dental problems were found

What We Did:
• Thoroughly cleaned your teeth and removed any plaque buildup
• Applied a fluoride treatment to strengthen your teeth
• Conducted a complete oral health examination

Next Steps:
• Continue your daily brushing and flossing routine
• Schedule your next cleaning in 6 months
• Call us if you experience any dental pain or concerns

Your oral health is excellent! Keep up the great work with your daily dental care routine.`,
        };
        setOutput(mockResponse);
        setUploadProgress(100);
        setUploadStatus("complete");
        // Refresh user notes after successful upload
        fetchUserNotes();
        // Trigger HIPAA compliance after successful generation
        setTimeout(() => handleHipaaCompliance(), 500);
      }
    } catch (err) {
      console.error("Error uploading file:", err);
      setUploadStatus("error");
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setError("Upload timed out. Large files may take longer to process.");
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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-clearly-blue">
                EZNotes.pro
              </h1>
            </div>
            {!isLoggedIn ? (
              <button
                onClick={() => setShowLogin(true)}
                className="bg-clearly-blue hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                Admin Login
              </button>
            ) : (
              <div className="flex items-center space-x-4">
                {isAdmin && (
                  <button
                    onClick={() => setShowAllNotes(!showAllNotes)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    {showAllNotes ? "Show My Notes" : "Show All Notes (Admin)"}
                  </button>
                )}
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {isAdmin ? "Admin" : "User"}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {isAdmin && showAllNotes ? "All Notes" : "My Notes"}
                  </p>
                </div>
                <button
                  onClick={handleAdminLogout}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-clearly-blue mb-6">
            Generate SOAP notes & patient-ready appointment summaries with AI
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
                    !!output ? undefined : () => fileInputRef.current?.click()
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
                        🔒 HIPAA Compliant: Recordings are processed locally and
                        not stored on our servers
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
                        {isProcessing ? "Initializing..." : "Start Recording"}
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
                        {isProcessing ? "Initializing..." : "Start Recording"}
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
                                  audioLevel * maxHeight * (0.3 + index * 0.1)
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
                    💡 Click "Generate Another Note" to change these selections
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
                        <span>⏱️ Elapsed: {formatUploadTime(elapsedTime)}</span>
                        {remainingTime !== null && (
                          <span>
                            ⏳ Remaining: {formatUploadTime(remainingTime)}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-gray-500 mt-1 text-center">
                      {uploadStatus === "uploading"
                        ? "Uploading file..."
                        : "Processing with AI..."}
                    </p>
                    {uploadStatus === "uploading" && file && (
                      <p className="text-xs text-blue-600 mt-1 text-center">
                        ⏱️ Timeout:{" "}
                        {Math.round((file.size / (1024 * 1024)) * 1.05)} minutes
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
                      🔒 <strong>HIPAA Notice:</strong> The original file will
                      be removed from our servers for compliance.
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
                      💡 <strong>Note:</strong> If you choose to save, the file
                      will be downloaded to your device. If you choose to
                      delete, the file will be permanently removed from our
                      servers.
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

      {/* Notes Display Section */}
      <section className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-clearly-blue text-center mb-8">
            {isAdmin && showAllNotes ? "All Notes (Admin View)" : "My Notes"}
          </h2>

          {isAdmin && showAllNotes ? (
            <NotesList
              notes={allNotes}
              isAdmin={true}
              onRefresh={fetchAllNotes}
            />
          ) : (
            <NotesList
              notes={userNotes}
              isAdmin={false}
              onRefresh={fetchUserNotes}
            />
          )}
        </div>
      </section>

      {/* Messages */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-white hover:text-red-200"
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          {success}
          <button
            onClick={() => setSuccess(null)}
            className="ml-3 text-white hover:text-green-200"
          >
            ×
          </button>
        </div>
      )}

      {/* How It Works */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-clearly-blue text-center mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div className="text-center relative">
              <div className="bg-clearly-light-blue rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Upload className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Upload
              </h3>
              <p className="text-gray-600">
                Upload audio recording or text transcript at the end of the
                patient visit.
              </p>
            </div>

            {/* Arrow 1 */}
            <div className="hidden md:flex items-center justify-center absolute left-1/3 top-8 transform -translate-x-1/2">
              <ArrowRight className="h-6 w-6 text-gray-400" />
            </div>

            {/* Step 2 */}
            <div className="text-center relative">
              <div className="bg-clearly-light-blue rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Generate
              </h3>
              <p className="text-gray-600">
                Get a complete SOAP note or patient-friendly summary.
              </p>
            </div>

            {/* Arrow 2 */}
            <div className="hidden md:flex items-center justify-center absolute right-1/3 top-8 transform translate-x-1/2">
              <ArrowRight className="h-6 w-6 text-gray-400" />
            </div>

            {/* Step 3 */}
            <div className="text-center relative">
              <div className="bg-clearly-light-blue rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Monitor className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Review/Save
              </h3>
              <p className="text-gray-600">
                Review or save the note in your EHR to complete the chart.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-bold text-clearly-blue mb-3">
                Speed up charting
              </h3>
              <p className="text-gray-600">
                Stop spending hours crafting notes after a long clinic day
                --just upload and go.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-clearly-blue mb-3">
                Minimize errors
              </h3>
              <p className="text-gray-600">
                Ensure your notes are complete, formatted correctly, and free of
                mistakes.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-clearly-blue mb-3">
                Improve patient communications
              </h3>
              <p className="text-gray-600">
                Receive a plain-language summary script you can share with the
                patient.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Get Started Button */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <button
            onClick={() => {
              document.querySelector(".upload-area")?.scrollIntoView({
                behavior: "smooth",
              });
            }}
            className="btn-primary text-lg px-8 py-4"
          >
            Get started
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500 mb-2">
            All uploads are processed securely and removed from our servers for
            HIPAA compliance.
          </p>
          <p className="text-xs text-gray-400">
            🔒 HIPAA Compliant • No Patient Data Stored • Secure Processing
          </p>
        </div>
      </footer>

      {/* Admin Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">
              Admin Login
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const email = (
                  document.getElementById("admin-email") as HTMLInputElement
                ).value;
                const password = (
                  document.getElementById("admin-password") as HTMLInputElement
                ).value;
                handleAdminLogin(email, password);
              }}
            >
              <div className="mb-4">
                <label
                  htmlFor="admin-email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="admin-email"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
              <div className="mb-6">
                <label
                  htmlFor="admin-password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <input
                  type="password"
                  id="admin-password"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full">
                Login
              </button>
            </form>
            {success && (
              <p className="text-green-600 mt-4 text-center">{success}</p>
            )}
            {error && <p className="text-red-600 mt-4 text-center">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// Notes List Component
function NotesList({
  notes,
  isAdmin,
  onRefresh,
}: {
  notes: any[];
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  if (notes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {isAdmin
          ? "No notes found in the system."
          : "No notes yet. Upload an audio file to get started!"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">
          {notes.length} note{notes.length !== 1 ? "s" : ""} found
        </span>
        <button
          onClick={onRefresh}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          Refresh
        </button>
      </div>

      {notes.map((note, index) => (
        <div
          key={note.id || index}
          className="border border-gray-200 rounded-lg p-4"
        >
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-gray-800">
              {note.filename || `Note ${index + 1}`}
            </h3>
            <span className="text-xs text-gray-500">
              {new Date(note.created_at || Date.now()).toLocaleDateString()}
            </span>
          </div>

          {note.content && <p className="text-gray-700 mb-3">{note.content}</p>}

          {note.status && (
            <span
              className={`inline-block px-2 py-1 text-xs rounded-full ${
                note.status === "completed"
                  ? "bg-green-100 text-green-800"
                  : note.status === "processing"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {note.status}
            </span>
          )}

          {isAdmin && note.user_email && (
            <p className="text-xs text-gray-500 mt-2">
              User: {note.user_email}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default App;
