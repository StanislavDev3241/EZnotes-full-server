import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  Mic,
  MicOff,
  AlertCircle,
  FileAudio,
  CheckCircle,
  Loader2,
} from "lucide-react";

interface UploadResult {
  success: boolean;
  file: {
    id: string;
    status: string;
  };
  notes?: {
    soapNote: string;
    patientSummary: string;
  };
  transcription?: string;
  error?: string;
  message?: string;
  fileName?: string;
  customPrompt?: string;
  conversationId?: string;
}

interface EnhancedUploadProps {
  onUploadComplete: (result: UploadResult) => void;
  onError?: (error: string) => void;
  API_BASE_URL: string;
  isUnregisteredUser?: boolean;
  onShowSignup?: () => void;
}

// Chunk upload configuration
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB threshold for chunking (changed from 50MB)

interface ChunkUploadState {
  isChunked: boolean;
  totalChunks: number;
  uploadedChunks: number;
  fileId: string;
  filename: string;
  fileType: string;
  fileSize: number;
}

const EnhancedUpload: React.FC<EnhancedUploadProps> = ({
  onUploadComplete,
  onError,
  API_BASE_URL,
  isUnregisteredUser = false,
  onShowSignup,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>(
    `SOAP note generator update; SYSTEM PROMPT — Dental SOAP Note Generator (Compact, <8k)

ROLE
You are a clinical documentation assistant for dental professionals. From a transcribed dictation, you will produce a structured SOAP note. You are category‑aware, anesthesia‑aware, and compliance‑safe.

PRIMARY BEHAVIOR
1) Detect appointment category from transcript using the keyword map in Knowledge ("SOAP Reference v1"). If multiple categories appear, choose the most invasive (implant > extraction > endo > operative > hygiene > emergency).
2) Apply only that category's rules (also in Knowledge). Do not assume facts.
3) Early‑Stop: If any category‑required details are missing (e.g., anesthesia type/strength/carpules for operative/endo/implant/extraction), STOP and output a single clarification request. Do not generate a partial note or JSON.
4) Use the Fuzzy Anesthetic Recognition rules and tables in Knowledge to recognize brand/generic, strengths, epi ratios, shorthand, and misspellings. Never assume concentration when more than one exists—ask to confirm.
5) Source fidelity: use only content stated or clearly paraphrased from transcript. Avoid stock phrases unless explicitly said.
6) Formatting: Use bullets for multiple Objective/Plan items. Split Plan into: Completed Today / Instructions Given / Next Steps.
7) End notes with signature placeholder (below).

OUTPUT ORDER (STRICT)
If Early‑Stop triggers: output only the clarification question defined below.
If proceeding, output these two blocks in order:
A) META JSON block delimited by:
<<META_JSON>>
{ … see schema in Knowledge: "Mini Extraction Schema v1" … }
<<END_META_JSON>>

B) SOAP Note block delimited by:
<<SOAP_NOTE>>
[Standard SOAP format with category‑specific rules applied]
<<SOAP_NOTE>>

SIGNATURE PLACEHOLDER
[Signature placeholder for dental professional]`
  );

  // Chunk upload state
  const [chunkUploadState, setChunkUploadState] =
    useState<ChunkUploadState | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    stage: string;
    message: string;
    percentage: number;
  }>({
    stage: "",
    message: "",
    percentage: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);

  // Generate unique file ID for chunked uploads
  const generateFileId = () => {
    return `file_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  };

  // Split file into chunks
  const splitFileIntoChunks = (file: File): Blob[] => {
    const chunks: Blob[] = [];
    let start = 0;

    while (start < file.size) {
      const end = Math.min(start + CHUNK_SIZE, file.size);
      chunks.push(file.slice(start, end));
      start = end;
    }

    return chunks;
  };

  // Upload single chunk
  const uploadChunk = async (
    chunk: Blob,
    chunkIndex: number,
    totalChunks: number,
    fileId: string,
    filename: string
  ): Promise<boolean> => {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const formData = new FormData();
        formData.append("chunk", chunk);
        formData.append("chunkIndex", chunkIndex.toString());
        formData.append("totalChunks", totalChunks.toString());
        formData.append("fileId", fileId);
        formData.append("filename", filename);

        const response = await fetch(`${API_BASE_URL}/api/upload/chunk`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Chunk upload failed");
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || "Chunk upload failed");
        }

        return true;
      } catch (error) {
        retryCount++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Chunk ${chunkIndex} upload attempt ${retryCount} failed:`,
          error
        );

        if (retryCount >= maxRetries) {
          throw new Error(
            `Chunk ${chunkIndex} failed after ${maxRetries} attempts: ${errorMessage}`
          );
        }

        // Wait before retry (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, retryCount) * 1000)
        );
      }
    }

    return false;
  };

  // Finalize chunked upload
  const finalizeChunkedUpload = async (
    fileId: string,
    filename: string,
    fileType: string,
    fileSize: number,
    totalChunks: number,
    customPrompt: string
  ): Promise<any> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileId,
          filename,
          fileType,
          fileSize,
          totalChunks,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Handle specific corruption errors
        if (
          errorData.error === "File corruption detected" ||
          errorData.error === "Audio file corruption detected" ||
          errorData.error === "Chunk processing failed"
        ) {
          console.error(`🚨 CORRUPTION DETECTED:`, errorData);

          // Show user-friendly corruption error
          const corruptionError = new Error(
            `File corruption detected during upload. This usually indicates a network issue or server problem. ` +
              `Please try uploading again. If the problem persists, try: ` +
              `1) Using a smaller file, 2) Checking your internet connection, 3) Contacting support.`
          );

          // Add corruption details to error
          (corruptionError as any).corruptionDetails = errorData;
          throw corruptionError;
        }

        throw new Error(errorData.message || "Finalization failed");
      }

      const result = await response.json();

      // Validate the result contains expected data
      if (!result.success || !result.file) {
        throw new Error("Invalid response from server during finalization");
      }

      return result;
    } catch (error) {
      console.error("Finalization failed:", error);

      // Re-throw corruption errors with enhanced context
      if (error instanceof Error && error.message.includes("corruption")) {
        throw error;
      }

      // Handle other finalization errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `File finalization failed: ${errorMessage}. Please try uploading again.`
      );
    }
  };

  // Handle chunked upload
  const handleChunkedUpload = async (file: File, customPrompt: string) => {
    const fileId = generateFileId();
    const chunks = splitFileIntoChunks(file);
    const totalChunks = chunks.length;

    setChunkUploadState({
      isChunked: true,
      totalChunks,
      uploadedChunks: 0,
      fileId,
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
    });

    setUploadProgress({
      stage: "uploading",
      message: `Uploading chunks (0/${totalChunks})...`,
      percentage: 0,
    });

    try {
      // Upload chunks one by one
      for (let i = 0; i < chunks.length; i++) {
        await uploadChunk(chunks[i], i, totalChunks, fileId, file.name);

        setChunkUploadState((prev) =>
          prev
            ? {
                ...prev,
                uploadedChunks: i + 1,
              }
            : null
        );

        setUploadProgress({
          stage: "uploading",
          message: `Uploading chunks (${i + 1}/${totalChunks})...`,
          percentage: ((i + 1) / totalChunks) * 50, // First 50% for upload
        });
      }

      // Finalize upload
      setUploadProgress({
        stage: "finalizing",
        message: "Combining chunks and processing...",
        percentage: 50,
      });

      const result = await finalizeChunkedUpload(
        fileId,
        file.name,
        file.type,
        file.size,
        totalChunks,
        customPrompt
      );

      setUploadProgress({
        stage: "complete",
        message: "Upload complete!",
        percentage: 100,
      });

      return result;
    } catch (error) {
      console.error("Chunked upload failed:", error);

      // Fallback to regular upload for smaller files
      if (file.size < 100 * 1024 * 1024) {
        // 100MB
        console.log(
          "🔄 Falling back to regular upload due to chunked upload failure"
        );
        setUploadProgress({
          stage: "fallback",
          message: "Chunked upload failed, trying regular upload...",
          percentage: 25,
        });

        try {
          const fallbackResult = await handleRegularUpload(file, customPrompt);
          setUploadProgress({
            stage: "complete",
            message: "Upload complete (fallback method)!",
            percentage: 100,
          });
          return fallbackResult;
        } catch (fallbackError) {
          console.error("Fallback upload also failed:", fallbackError);
          throw error; // Throw original error if fallback also fails
        }
      } else {
        throw error; // For very large files, don't fallback
      }
    }
  };

  // Handle regular upload (small files)
  const handleRegularUpload = async (file: File, customPrompt: string) => {
    const uploadData = new FormData();
    uploadData.append("file", file);

    if (customPrompt.trim()) {
      uploadData.append("customPrompt", customPrompt.trim());
    }

    setUploadProgress({
      stage: "uploading",
      message: "Uploading file...",
      percentage: 0,
    });

    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: "POST",
      body: uploadData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Upload failed");
    }

    setUploadProgress({
      stage: "transcribing",
      message: "Transcribing audio...",
      percentage: 50,
    });

    const result = await response.json();

    setUploadProgress({
      stage: "generating",
      message: "Generating notes...",
      percentage: 75,
    });

    setUploadProgress({
      stage: "complete",
      message: "Upload complete!",
      percentage: 100,
    });

    return result;
  };

  // Main upload handler
  const handleUpload = async () => {
    if (!file && !audioBlob) {
      setLocalError("Please select a file or record audio first");
      return;
    }

    setIsUploading(true);
    setLocalError(null);

    try {
      let result: UploadResult;
      let fileName: string;

      if (audioBlob) {
        // Convert audio blob to file
        const audioFile = new File([audioBlob], `recording_${Date.now()}.wav`, {
          type: "audio/wav",
        });

        // Choose upload method based on file size
        if (audioFile.size > LARGE_FILE_THRESHOLD) {
          result = await handleChunkedUpload(audioFile, customPrompt);
        } else {
          result = await handleRegularUpload(audioFile, customPrompt);
        }
        fileName = audioFile.name;
      } else if (file) {
        // Choose upload method based on file size
        if (file.size > LARGE_FILE_THRESHOLD) {
          result = await handleChunkedUpload(file, customPrompt);
        } else {
          result = await handleRegularUpload(file, customPrompt);
        }
        fileName = file.name;
      } else {
        throw new Error("No file to upload");
      }

      // Call the callback with the result
      onUploadComplete({
        ...result,
        fileName,
        customPrompt: customPrompt.trim() || "Default prompt",
      });

      // Reset form
      setFile(null);
      setAudioBlob(null);
      setChunkUploadState(null);
      setRecordingTime(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      const errorMsg = error instanceof Error ? error.message : "Upload failed";
      setLocalError(errorMsg);
      onError && onError(errorMsg);
    } finally {
      setIsUploading(false);
      setUploadProgress({
        stage: "",
        message: "",
        percentage: 0,
      });
    }
  };

  // Clear local error when user starts new action
  const clearLocalError = () => {
    setLocalError(null);
  };

  // File handling
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setAudioBlob(null);
      setRecordingTime(0);
      clearLocalError();
    }
  };

  const handleFileDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setAudioBlob(null);
      setRecordingTime(0);
      clearLocalError();
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
      clearLocalError();

      // Start timer
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      const errorMsg =
        "Failed to start recording. Please check microphone permissions.";
      setLocalError(errorMsg);
      onError && onError(errorMsg);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      // Cleanup media recorder
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      mediaRecorderRef.current = null;
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
    clearLocalError();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Error Display - Local to upload page */}
      {localError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-800">
              <p className="font-medium">
                {localError.includes("corruption")
                  ? "🚨 File Corruption Detected"
                  : "Upload Error"}
              </p>
              <p className="mt-1">{localError}</p>

              {/* Show corruption-specific guidance */}
              {localError.includes("corruption") && (
                <div className="mt-3 p-3 bg-red-100 rounded border border-red-300">
                  <p className="text-xs font-medium text-red-800 mb-2">
                    What this means:
                  </p>
                  <ul className="text-xs text-red-700 space-y-1">
                    <li>• Your file may have been corrupted during upload</li>
                    <li>• This could affect transcription accuracy</li>
                    <li>
                      • The system automatically rejected the corrupted file
                    </li>
                  </ul>
                  <p className="text-xs text-red-700 mt-2">
                    <strong>Recommendation:</strong> Try uploading again. If the
                    problem persists, try using a smaller file or check your
                    internet connection.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Prompt Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Custom Instructions
        </label>
        {isUnregisteredUser ? (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <p className="text-sm text-gray-600">
              Custom prompt editing is available for registered users.
              <button
                onClick={() => onShowSignup && onShowSignup()}
                className="ml-1 text-blue-600 hover:text-blue-800 underline"
              >
                Sign up
              </button>{" "}
              to customize your AI instructions.
            </p>
          </div>
        ) : (
          <>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Enter custom instructions for note generation..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={4}
            />
            <p className="text-xs text-gray-500">
              These instructions will guide the AI in generating your dental
              SOAP notes.
            </p>
          </>
        )}
      </div>

      {/* File Upload Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
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
                className="text-red-600 hover:text-red-800 text-sm transition-colors"
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

        {/* File Info Display */}
        {file && (
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileAudio className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  {file.name}
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-600">
                  {Math.round(file.size / 1024 / 1024)}MB
                </span>
                {file.size > LARGE_FILE_THRESHOLD && (
                  <div className="text-xs text-blue-600 font-medium">
                    Will use chunked upload
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Audio Recording Info */}
        {audioBlob && (
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mic className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Audio Recording
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-600">
                  {Math.round(audioBlob.size / 1024 / 1024)}MB
                </span>
                {audioBlob.size > LARGE_FILE_THRESHOLD && (
                  <div className="text-xs text-blue-600 font-medium">
                    Will use chunked upload
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Audio Recording Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
              isRecording
                ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
                : "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500"
            }`}
          >
            {isRecording ? (
              <>
                <MicOff className="w-4 h-4" />
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
        onClick={handleUpload}
        disabled={isUploading || (!file && !audioBlob)}
        className={`w-full py-3 px-4 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
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

      {/* Progress Display */}
      {uploadProgress.stage && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-800">
              {uploadProgress.stage === "uploading" && chunkUploadState
                ? `Uploading ${chunkUploadState.uploadedChunks}/${chunkUploadState.totalChunks} chunks`
                : uploadProgress.stage === "finalizing"
                ? "Finalizing upload"
                : uploadProgress.stage === "transcribing"
                ? "Transcribing audio"
                : uploadProgress.stage === "generating"
                ? "Generating notes"
                : "Complete"}
            </span>
            <span className="text-sm text-blue-600">
              {Math.round(uploadProgress.percentage)}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress.percentage}%` }}
            />
          </div>

          {/* Status Message */}
          <p className="text-sm text-blue-700 mt-2">{uploadProgress.message}</p>

          {/* Chunk Upload Details */}
          {chunkUploadState && uploadProgress.stage === "uploading" && (
            <div className="mt-3 p-3 bg-blue-100 rounded border border-blue-300">
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-800">
                  Chunk {chunkUploadState.uploadedChunks} of{" "}
                  {chunkUploadState.totalChunks}
                </span>
                <span className="text-blue-600 font-medium">
                  {Math.round(
                    (chunkUploadState.uploadedChunks /
                      chunkUploadState.totalChunks) *
                      100
                  )}
                  %
                </span>
              </div>
              <div className="mt-2 text-xs text-blue-600">
                File: {chunkUploadState.filename} (
                {Math.round(chunkUploadState.fileSize / 1024 / 1024)}MB)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedUpload;
