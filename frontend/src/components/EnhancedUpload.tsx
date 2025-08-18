import React, { useState, useRef, useCallback } from "react";
import { Upload, Mic, X, CheckCircle, Loader2 } from "lucide-react";

interface EnhancedUploadProps {
  onUploadComplete: (data: any) => void;
  onError: (error: string) => void;
}

interface UploadProgress {
  stage: "uploading" | "transcribing" | "generating" | "complete";
  message: string;
  percentage: number;
}

const EnhancedUpload: React.FC<EnhancedUploadProps> = ({
  onUploadComplete,
  onError,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: "uploading",
    message: "",
    percentage: 0,
  });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number>();

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  // File handling
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setAudioBlob(null);
      setRecordingTime(0);
    }
  };

  const handleFileDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setAudioBlob(null);
      setRecordingTime(0);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  // Audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/wav" });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      onError(
        "Failed to start recording. Please check microphone permissions."
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  // Upload processing
  const processUpload = async () => {
    if (!file && !audioBlob) {
      onError("Please select a file or record audio first.");
      return;
    }

    setIsUploading(true);
    setUploadProgress({
      stage: "uploading",
      message: "Uploading file...",
      percentage: 0,
    });

    try {
      let uploadData: FormData;
      let fileName: string;

      if (audioBlob) {
        // Convert audio blob to file
        const audioFile = new File([audioBlob], `recording_${Date.now()}.wav`, {
          type: "audio/wav",
        });
        uploadData = new FormData();
        uploadData.append("file", audioFile);
        fileName = audioFile.name;
      } else if (file) {
        uploadData = new FormData();
        uploadData.append("file", file);
        fileName = file.name;
      } else {
        throw new Error("No file to upload");
      }

      // Add custom prompt if provided
      if (customPrompt.trim()) {
        uploadData.append("customPrompt", customPrompt.trim());
      }

      setUploadProgress({
        stage: "transcribing",
        message: "Transcribing audio...",
        percentage: 50,
      });

      // Upload and process with OpenAI
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: uploadData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Upload failed");
      }

      setUploadProgress({
        stage: "generating",
        message: "Generating notes...",
        percentage: 75,
      });

      const result = await response.json();

      setUploadProgress({
        stage: "complete",
        message: "Upload complete!",
        percentage: 100,
      });

      // Call the callback with the result
      onUploadComplete({
        ...result,
        fileName,
        customPrompt: customPrompt.trim() || "Default prompt",
      });

      // Reset form
      setFile(null);
      setAudioBlob(null);
      setCustomPrompt("");
      setRecordingTime(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      onError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress({
        stage: "uploading",
        message: "",
        percentage: 0,
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const removeFile = () => {
    setFile(null);
    setAudioBlob(null);
    setRecordingTime(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Custom Prompt Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Custom Instructions (Optional)
        </label>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Enter custom instructions for note generation (e.g., 'Focus on anesthetic details and procedure steps')"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={3}
        />
      </div>

      {/* File Upload Section */}
      <div className="space-y-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Upload className="w-4 h-4" />
            <span>Choose File</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.mp3,.wav,.m4a,.aac"
            onChange={handleFileSelect}
            className="hidden"
          />
          <span className="text-sm text-gray-500">or drag and drop</span>
        </div>

        {/* Drag & Drop Area */}
        <div
          onDrop={handleFileDrop}
          onDragOver={handleDragOver}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            file || audioBlob
              ? "border-green-300 bg-green-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {file || audioBlob ? (
            <div className="space-y-2">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto" />
              <p className="text-sm text-gray-600">
                {file ? file.name : `Recording (${formatTime(recordingTime)})`}
              </p>
              <button
                onClick={removeFile}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-sm text-gray-600">
                Drag and drop a file here, or click to browse
              </p>
              <p className="text-xs text-gray-500">
                Supports: TXT, MP3, WAV, M4A, AAC
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Audio Recording Section */}
      <div className="space-y-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isRecording
                ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
                : "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500"
            }`}
          >
            {isRecording ? (
              <>
                <X className="w-4 h-4" />
                <span>Stop Recording</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>Start Recording</span>
              </>
            )}
          </button>
          {isRecording && (
            <span className="text-sm text-gray-600">
              Recording: {formatTime(recordingTime)}
            </span>
          )}
        </div>
      </div>

      {/* Upload Button */}
      <button
        onClick={processUpload}
        disabled={isUploading || (!file && !audioBlob)}
        className={`w-full py-3 px-4 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          isUploading || (!file && !audioBlob)
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
        }`}
      >
        {isUploading ? (
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{uploadProgress.message}</span>
          </div>
        ) : (
          "Process with AI"
        )}
      </button>

      {/* Progress Bar */}
      {isUploading && (
        <div className="space-y-2">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress.percentage}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 text-center">
            {uploadProgress.message} ({uploadProgress.percentage}%)
          </p>
        </div>
      )}
    </div>
  );
};

export default EnhancedUpload;
