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
  };
  onClose: () => void;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result, onClose }) => {
  const [activeTab, setActiveTab] = useState<"soap" | "summary" | "transcription">("soap");
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
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

  if (result.status === "failed") {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <div className="flex items-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-500 mr-3" />
            <h2 className="text-xl font-bold text-gray-800">Processing Failed</h2>
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
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-green-500 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-800">AI Processing Complete</h2>
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
                <h3 className="text-lg font-semibold text-gray-800">SOAP Note</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => copyToClipboard(result.notes!.soapNote, "soap")}
                    className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    {copied === "soap" ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() => downloadAsText(result.notes!.soapNote, "soap_note.txt")}
                    className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-gray-800">
                {result.notes.soapNote}
              </div>
            </div>
          )}

          {activeTab === "summary" && result.notes?.patientSummary && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Patient Summary</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => copyToClipboard(result.notes!.patientSummary, "summary")}
                    className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    {copied === "summary" ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() => downloadAsText(result.notes!.patientSummary, "patient_summary.txt")}
                    className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-gray-800">
                {result.notes.patientSummary}
              </div>
            </div>
          )}

          {activeTab === "transcription" && result.transcription && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Audio Transcription</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => copyToClipboard(result.transcription!, "transcription")}
                    className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    {copied === "transcription" ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() => downloadAsText(result.transcription!, "transcription.txt")}
                    className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-gray-800">
                {result.transcription}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Generated with OpenAI GPT-4 and Whisper AI
            </p>
            <button
              onClick={onClose}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay; 