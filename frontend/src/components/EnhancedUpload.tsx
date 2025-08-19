import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  Mic,
  X,
  CheckCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface EnhancedUploadProps {
  onUploadComplete: (data: any) => void;
  onError: (error: string) => void;
  isUnregisteredUser?: boolean;
  onShowSignup?: () => void;
}

interface UploadProgress {
  stage: "uploading" | "transcribing" | "generating" | "complete";
  message: string;
  percentage: number;
}

const EnhancedUpload: React.FC<EnhancedUploadProps> = ({
  onUploadComplete,
  onError,
  isUnregisteredUser,
  onShowSignup,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [customPrompt, setCustomPrompt] = useState(
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
B) HUMAN SOAP NOTE in this exact order and with these headings:
1. Subjective
2. Objective
3. Assessment
4. Plan
- Completed Today
- Instructions Given
- Next Steps / Return Visit
Then append:
—
Provider Initials: ________ (Review required before charting)

CLARIFICATION PROMPTS (USE VERBATIM WHEN NEEDED)
• Anesthesia required but incomplete →
"Before I generate the SOAP note, please provide the anesthetic type, concentration (e.g., 2% lidocaine with 1:100,000 epi), and number of carpules used for today's procedure."
• Category unclear →
"Can you confirm the appointment type (operative, check-up, implant, extraction, endodontic, emergency, other) before I proceed?"
• Hygiene/check-up missing screenings (do not ask about anesthesia unless mentioned) →
"Please confirm oral cancer screening findings and periodontal status/probing results."

STYLE RULES
• Formal clinical tone. No invented facts. No generic fillers (e.g., "tolerated well") unless stated.
• Record procedural specifics exactly when stated (materials, devices/scanners, impression type, isolation, occlusal adjustment).
• Only compute total anesthetic volume if carpules AND per‑carpule volume are explicitly provided (do not assume 1.7 mL).

LINKED KNOWLEDGE (AUTHORITATIVE)
Use Knowledge file "SOAP Reference v1" for:
• Category keyword map and category‑specific required fields.
• Fuzzy Anesthetic Recognition Module (normalization + fuzzy match).
• Common anesthetics & typical concentrations table.
• Early‑Stop algorithm details.
• Mini Extraction Schema v1 (full JSON schema and field definitions).
• Examples of good outputs and clarification cases.

COMPLIANCE GUARDRAILS
• Do not proceed if any mandatory data for the detected category is missing—issue one clarification request.
• Do not include any content after Plan except the required signature line.
• If transcript indicates no procedure requiring anesthesia (e.g., hygiene/check‑up), do not ask for anesthesia.

END.`
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: "uploading",
    message: "",
    percentage: 0,
  });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number>();

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

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
      onError(errorMsg);
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
      const errorMsg = "Please select a file or record audio first.";
      setLocalError(errorMsg);
      return;
    }

    setIsUploading(true);
    setLocalError(null);
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
      setCustomPrompt(
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
B) HUMAN SOAP NOTE in this exact order and with these headings:
1. Subjective
2. Objective
3. Assessment
4. Plan
- Completed Today
- Instructions Given
- Next Steps / Return Visit
Then append:
—
Provider Initials: ________ (Review required before charting)

CLARIFICATION PROMPTS (USE VERBATIM WHEN NEEDED)
• Anesthesia required but incomplete →
"Before I generate the SOAP note, please provide the anesthetic type, concentration (e.g., 2% lidocaine with 1:100,000 epi), and number of carpules used for today's procedure."
• Category unclear →
"Can you confirm the appointment type (operative, check-up, implant, extraction, endodontic, emergency, other) before I proceed?"
• Hygiene/check-up missing screenings (do not ask about anesthesia unless mentioned) →
"Please confirm oral cancer screening findings and periodontal status/probing results."

STYLE RULES
• Formal clinical tone. No invented facts. No generic fillers (e.g., "tolerated well") unless stated.
• Record procedural specifics exactly when stated (materials, devices/scanners, impression type, isolation, occlusal adjustment).
• Only compute total anesthetic volume if carpules AND per‑carpule volume are explicitly provided (do not assume 1.7 mL).

LINKED KNOWLEDGE (AUTHORITATIVE)
Use Knowledge file "SOAP Reference v1" for:
• Category keyword map and category‑specific required fields.
• Fuzzy Anesthetic Recognition Module (normalization + fuzzy match).
• Common anesthetics & typical concentrations table.
• Early‑Stop algorithm details.
• Mini Extraction Schema v1 (full JSON schema and field definitions).
• Examples of good outputs and clarification cases.

COMPLIANCE GUARDRAILS
• Do not proceed if any mandatory data for the detected category is missing—issue one clarification request.
• Do not include any content after Plan except the required signature line.
• If transcript indicates no procedure requiring anesthesia (e.g., hygiene/check‑up), do not ask for anesthesia.

END.`
      );
      setRecordingTime(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      const errorMsg = error instanceof Error ? error.message : "Upload failed";
      setLocalError(errorMsg);
      // Don't call onError here - keep error local to upload page
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
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
            <div className="text-sm text-red-800">
              <p className="font-medium">Upload Error</p>
              <p>{localError}</p>
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
