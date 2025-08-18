import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  Mic,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  MessageSquare,
  Settings,
} from "lucide-react";

interface EnhancedUploadProps {
  onUploadComplete: (data: any) => void;
  onError: (error: string) => void;
}

interface UploadResult {
  fileId: string;
  status: string;
  notes?: {
    soapNote: string;
    patientSummary: string;
  };
  transcription?: string;
  error?: string;
}

const EnhancedUpload: React.FC<EnhancedUploadProps> = ({
  onUploadComplete,
  onError,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "processing" | "complete" | "error"
  >("idle");
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<number | null>(null);

  // API Configuration
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";
  const UPLOAD_ENDPOINT = `${API_BASE_URL}/api/upload`;

  const startProgressTimer = useCallback(() => {
    setStartTime(Date.now());
    progressIntervalRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopProgressTimer = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setStartTime(null);
    setElapsedTime(0);
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = [
        "audio/mpeg",
        "audio/wav",
        "audio/mp3",
        "audio/ogg",
        "audio/aac",
        "text/plain",
        "application/pdf",
      ];

      if (!allowedTypes.includes(selectedFile.type)) {
        onError("Invalid file type. Please upload audio or text files only.");
        return;
      }

      // Validate file size (100MB limit)
      if (selectedFile.size > 100 * 1024 * 1024) {
        onError("File size too large. Please upload files smaller than 100MB.");
        return;
      }

      setFile(selectedFile);
      setUploadStatus("idle");
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadStatus("uploading");
    setUploadProgress(0);
    startProgressTimer();

    try {
      const formData = new FormData();
      formData.append("file", file);
      
      if (customPrompt.trim()) {
        formData.append("customPrompt", customPrompt.trim());
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      setUploadStatus("processing");
      setUploadProgress(90);

      const response = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result: UploadResult = await response.json();

      if (result.status === "failed") {
        throw new Error(result.error || "Upload failed");
      }

      setUploadProgress(100);
      setUploadStatus("complete");
      
      // Wait a moment to show completion
      setTimeout(() => {
        onUploadComplete(result);
        resetUpload();
      }, 1000);

    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus("error");
      onError(error instanceof Error ? error.message : "Upload failed");
      resetUpload();
    } finally {
      setIsUploading(false);
      stopProgressTimer();
    }
  };

  const resetUpload = () => {
    setFile(null);
    setUploadProgress(0);
    setUploadStatus("idle");
    setCustomPrompt("");
    setShowCustomPrompt(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = () => {
    setFile(null);
    setUploadStatus("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusIcon = () => {
    switch (uploadStatus) {
      case "complete":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "processing":
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case "uploading":
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <Upload className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (uploadStatus) {
      case "complete":
        return "Upload Complete!";
      case "error":
        return "Upload Failed";
      case "processing":
        return "Processing with AI...";
      case "uploading":
        return "Uploading...";
      default:
        return "Ready to Upload";
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Enhanced AI Medical Note Generator
        </h2>
        <p className="text-gray-600">
          Upload audio or text files to generate comprehensive SOAP notes and patient summaries
        </p>
      </div>

      {/* File Upload Area */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-6">
        {!file ? (
          <div>
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              Drag and drop your file here, or click to browse
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Choose File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              accept="audio/*,text/plain,application/pdf"
              className="hidden"
            />
          </div>
        ) : (
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              {file.type.startsWith("audio/") ? (
                <Mic className="w-8 h-8 text-blue-500" />
              ) : (
                <FileText className="w-8 h-8 text-green-500" />
              )}
              <span className="ml-2 text-lg font-medium text-gray-800">
                {file.name}
              </span>
              <button
                onClick={removeFile}
                className="ml-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        )}
      </div>

      {/* Custom Prompt Section */}
      <div className="mb-6">
        <button
          onClick={() => setShowCustomPrompt(!showCustomPrompt)}
          className="flex items-center text-blue-600 hover:text-blue-700 mb-2"
        >
          <Settings className="w-4 h-4 mr-2" />
          {showCustomPrompt ? "Hide" : "Add"} Custom Instructions
        </button>
        
        {showCustomPrompt && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Custom Instructions for AI
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g., Focus on dental procedures, include anesthetic details, emphasize patient comfort..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to use default medical AI instructions
            </p>
          </div>
        )}
      </div>

      {/* Upload Progress */}
      {uploadStatus !== "idle" && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {getStatusText()}
            </span>
            {startTime && (
              <span className="text-sm text-gray-500">
                {formatTime(elapsedTime)}
              </span>
            )}
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          
          <div className="flex items-center justify-center mt-2">
            {getStatusIcon()}
          </div>
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!file || isUploading}
        className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
          !file || isUploading
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {isUploading ? "Processing..." : "Generate Medical Notes"}
      </button>

      {/* Features List */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className="p-3">
          <Mic className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <h3 className="font-medium text-gray-800">Audio Transcription</h3>
          <p className="text-sm text-gray-600">Whisper AI for accurate audio processing</p>
        </div>
        <div className="p-3">
          <MessageSquare className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <h3 className="font-medium text-gray-800">AI Generation</h3>
          <p className="text-sm text-gray-600">GPT-4 for comprehensive medical notes</p>
        </div>
        <div className="p-3">
          <CheckCircle className="w-8 h-8 text-purple-500 mx-auto mb-2" />
          <h3 className="font-medium text-gray-800">Custom Instructions</h3>
          <p className="text-sm text-gray-600">Tailored AI responses for your needs</p>
        </div>
      </div>
    </div>
  );
};

export default EnhancedUpload; 