import React, { useState } from "react";
import {
  FileText,
  Copy,
  Download,
  MessageSquare,
  Mic,
  CheckCircle,
  AlertCircle,
  X,
  Clipboard,
} from "lucide-react";

interface ResultsDisplayProps {
  result: {
    fileId: string;
    status: string;
    notes?: {
      soapNote: string;
      patientSummary: string;
    };
    transcription?: string;
    error?: string;
    selectedNoteTypes?: ("soap" | "summary")[];
  };
  onClose: () => void;
  onNextToChat?: () => void; // Add callback for chat navigation
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  result,
  onClose,
  onNextToChat,
}) => {
  // Set default tab based on selected note types
  const getDefaultTab = () => {
    if (result.selectedNoteTypes?.includes("summary") && result.notes?.patientSummary) {
      return "summary";
    }
    if (result.selectedNoteTypes?.includes("soap") && result.notes?.soapNote) {
      return "soap";
    }
    if (result.transcription) {
      return "transcription";
    }
    return "soap"; // fallback
  };

  const [activeTab, setActiveTab] = useState<
    "soap" | "summary" | "transcription"
  >(getDefaultTab());
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = async (text: string, type: string) => {
    try {
      // First try the modern clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
        return;
      }

      // Fallback for older browsers or non-secure contexts
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const successful = document.execCommand("copy");
        if (successful) {
          setCopied(type);
          setTimeout(() => setCopied(null), 2000);
        } else {
          throw new Error("Copy command failed");
        }
      } catch (err) {
        console.error("Fallback copy failed:", err);
        // Show user-friendly error
        alert("Copy failed. Please manually select and copy the text.");
      } finally {
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error("Failed to copy text: ", err);
      // Show user-friendly error
      alert("Copy failed. Please manually select and copy the text.");
    }
  };

  const downloadAsText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Clean SOAP note for EHR copying (remove metadata and formatting)
  const getCleanSOAPNote = (soapNote: string) => {
    // Remove metadata JSON blocks
    let cleanNote = soapNote.replace(
      /<<META_JSON>>[\s\S]*?<<END_META_JSON>>/g,
      ""
    );

    // Remove SOAP note delimiters
    cleanNote = cleanNote
      .replace(/<<SOAP_NOTE>>/g, "")
      .replace(/<<\/SOAP_NOTE>>/g, "");

    // Clean up extra whitespace
    cleanNote = cleanNote.trim();

    return cleanNote;
  };

  // Get clean patient summary
  const getCleanPatientSummary = (summary: string) => {
    return summary.trim();
  };

  if (result.status === "failed") {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <div className="flex items-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-500 mr-3" />
            <h2 className="text-xl font-bold text-gray-800">
              Processing Failed
            </h2>
          </div>
          <p className="text-gray-600 mb-4">
            {result.error || "An error occurred while processing your file."}
          </p>
          <button
            onClick={onClose}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-green-500 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                ClearlyAI - AI Processing Complete
              </h2>
              <p className="text-sm text-gray-600">File ID: {result.fileId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {result.notes?.soapNote &&
            result.selectedNoteTypes?.includes("soap") && (
              <button
                onClick={() => setActiveTab("soap")}
                className={`flex items-center px-6 py-3 border-b-2 transition-colors ${
                  activeTab === "soap"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <FileText className="w-4 h-4 mr-2" />
                SOAP Note
              </button>
            )}
          {result.notes?.patientSummary &&
            result.selectedNoteTypes?.includes("summary") && (
              <button
                onClick={() => setActiveTab("summary")}
                className={`flex items-center px-6 py-3 border-b-2 transition-colors ${
                  activeTab === "summary"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Patient Summary
              </button>
            )}
          {result.transcription && (
            <button
              onClick={() => setActiveTab("transcription")}
              className={`flex items-center px-6 py-3 border-b-2 transition-colors ${
                activeTab === "transcription"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Mic className="w-4 h-4 mr-2" />
              Transcription
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === "soap" && result.notes?.soapNote && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  SOAP Note - Ready for EHR
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() =>
                      copyToClipboard(
                        getCleanSOAPNote(result.notes!.soapNote),
                        "soap"
                      )
                    }
                    className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    {copied === "soap" ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() =>
                      downloadAsText(
                        getCleanSOAPNote(result.notes!.soapNote),
                        "soap_note.txt"
                      )
                    }
                    className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </button>
                  <button
                    onClick={() => {
                      const textArea = document.createElement("textarea");
                      textArea.value = getCleanSOAPNote(result.notes!.soapNote);
                      document.body.appendChild(textArea);
                      textArea.select();
                      document.execCommand("copy");
                      document.body.removeChild(textArea);
                      setCopied("soap");
                      setTimeout(() => setCopied(null), 2000);
                    }}
                    className="flex items-center px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                  >
                    <Clipboard className="w-4 h-4 mr-1" />
                    Select All
                  </button>
                </div>
              </div>

              {/* Full SOAP Note Display */}
              <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-gray-800 select-all border border-gray-200">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                  Click and drag to select text, or use the buttons above to
                  copy
                </div>
                <pre className="whitespace-pre-wrap text-gray-800 font-sans text-sm leading-relaxed cursor-text">
                  {result.notes.soapNote}
                </pre>
              </div>
            </div>
          )}

          {activeTab === "summary" && result.notes?.patientSummary && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Patient Summary
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() =>
                      copyToClipboard(
                        getCleanPatientSummary(result.notes!.patientSummary),
                        "summary"
                      )
                    }
                    className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    {copied === "summary" ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() =>
                      downloadAsText(
                        getCleanPatientSummary(result.notes!.patientSummary),
                        "patient_summary.txt"
                      )
                    }
                    className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </button>
                  <button
                    onClick={() => {
                      const textArea = document.createElement("textarea");
                      textArea.value = getCleanPatientSummary(
                        result.notes!.patientSummary
                      );
                      document.body.appendChild(textArea);
                      textArea.select();
                      document.execCommand("copy");
                      document.body.removeChild(textArea);
                      setCopied("summary");
                      setTimeout(() => setCopied(null), 2000);
                    }}
                    className="flex items-center px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                  >
                    <Clipboard className="w-4 h-4 mr-1" />
                    Select All
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-gray-800 select-all border border-gray-200">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                  Click and drag to select text, or use the buttons above to
                  copy
                </div>
                <pre className="whitespace-pre-wrap text-gray-800 font-sans text-sm leading-relaxed cursor-text">
                  {result.notes.patientSummary}
                </pre>
              </div>
            </div>
          )}

          {activeTab === "transcription" && result.transcription && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Audio Transcription
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() =>
                      copyToClipboard(result.transcription!, "transcription")
                    }
                    className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    {copied === "transcription" ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() =>
                      downloadAsText(result.transcription!, "transcription.txt")
                    }
                    className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </button>
                  <button
                    onClick={() => {
                      const textArea = document.createElement("textarea");
                      textArea.value = result.transcription!;
                      document.body.appendChild(textArea);
                      textArea.select();
                      document.execCommand("copy");
                      document.body.removeChild(textArea);
                      setCopied("transcription");
                      setTimeout(() => setCopied(null), 2000);
                    }}
                    className="flex items-center px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                  >
                    <Clipboard className="w-4 h-4 mr-1" />
                    Select All
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-gray-800 select-all border border-gray-200">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                  Click and drag to select text, or use the buttons above to
                  copy
                </div>
                <pre className="whitespace-pre-wrap text-gray-800 font-sans text-sm leading-relaxed cursor-text">
                  {result.transcription}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Generated with ClearlyAI - Ready for your EHR
            </p>
            {/* Action Buttons */}
            <div className="flex justify-end space-x-3">
              {onNextToChat && (
                <button
                  onClick={onNextToChat}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                >
                  Continue Chat
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
