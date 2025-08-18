import { useState, useRef, useEffect } from "react";
import { LogOut } from "lucide-react";
import EnhancedUpload from "./EnhancedUpload";
import ResultsDisplay from "./ResultsDisplay";
import ManagementPage from "./ManagementPage";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  noteContext?: any;
}

interface UploadResult {
  fileId: string;
  fileName: string;
  status: string;
  transcription: string;
  notes: {
    soapNote: string;
    patientSummary: string;
  };
  customPrompt: string;
}

interface MainDashboardProps {
  user: User;
  onLogout: () => void;
}

const MainDashboard: React.FC<MainDashboardProps> = ({ user, onLogout }) => {
  const [activeSection, setActiveSection] = useState<
    "chat" | "upload" | "management"
  >("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentNote, setCurrentNote] = useState<UploadResult | null>(null);
  const [showResults, setShowResults] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle upload completion
  const handleUploadComplete = (result: UploadResult) => {
    setCurrentNote(result);
    setShowResults(true);

    // Add initial AI message about the uploaded content
    const aiMessage: Message = {
      id: Date.now().toString(),
      text: `I've processed your ${
        result.fileName
      } file. Here's what I found:\n\n**Transcription:** ${result.transcription.substring(
        0,
        200
      )}...\n\n**Generated Notes:** ${result.notes.soapNote.substring(
        0,
        200
      )}...\n\nYou can now ask me questions about this content or request improvements to the notes.`,
      sender: "ai",
      timestamp: new Date(),
      noteContext: result,
    };

    setMessages((prev) => [...prev, aiMessage]);
    setActiveSection("chat");
  };

  const handleUploadError = (error: string) => {
    const errorMessage: Message = {
      id: Date.now().toString(),
      text: `Upload failed: ${error}`,
      sender: "ai",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, errorMessage]);
    setActiveSection("chat");
  };

  // Send chat message
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputMessage,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      // Send message to backend chat API
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("userToken")}`, // Fixed: was "token", should be "userToken"
        },
        body: JSON.stringify({
          message: inputMessage,
          noteContext: currentNote,
          conversationHistory: messages.slice(-10), // Send last 10 messages for context
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get AI response");
      }

      const aiResponse = await response.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse.response,
        sender: "ai",
        timestamp: new Date(),
        noteContext: currentNote,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I encountered an error. Please try again.",
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-900">
              ClearlyAI Dashboard
            </h1>
            <span className="text-sm text-gray-500">
              Welcome, {user.name} ({user.role})
            </span>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b px-4">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveSection("chat")}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeSection === "chat"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Chat & Notes
          </button>
          <button
            onClick={() => setActiveSection("upload")}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeSection === "upload"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Upload & Record
          </button>
          <button
            onClick={() => setActiveSection("management")}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeSection === "management"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Management
          </button>
        </div>
      </div>

      {/* Main Content - Account for header height */}
      <div className="flex-1 overflow-hidden pt-2">
        {activeSection === "chat" && (
          <div className="flex flex-col lg:flex-row h-full">
            {/* Chat Interface - Left Side */}
            <div className="flex-1 flex flex-col bg-white mx-2 rounded-lg shadow-sm">
              <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-20">
                    <p className="text-lg">No messages yet</p>
                    <p className="text-sm">
                      Upload a file or start recording to begin chatting with AI
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.sender === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm lg:text-base">
                          {message.text}
                        </p>
                        <p className="text-xs opacity-70 mt-1">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg">
                      <p className="text-gray-500">AI is thinking...</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="border-t bg-white p-4">
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                  <textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask me about the uploaded content or request improvements..."
                    className="flex-1 resize-none border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={2}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || isLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>

            {/* Notes Display - Right Side */}
            <div className="w-full lg:w-96 bg-gray-50 border-t lg:border-l lg:border-t-0 p-4 lg:p-6 overflow-y-auto mx-2 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Current Notes
              </h3>
              {currentNote ? (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <h4 className="font-medium text-gray-900 mb-2">
                      File: {currentNote.fileName}
                    </h4>
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>Custom Prompt:</strong> {currentNote.customPrompt}
                    </p>
                  </div>

                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <h4 className="font-medium text-gray-900 mb-2">
                      SOAP Note
                    </h4>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {currentNote.notes.soapNote.substring(0, 300)}...
                    </p>
                  </div>

                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <h4 className="font-medium text-gray-900 mb-2">
                      Patient Summary
                    </h4>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {currentNote.notes.patientSummary.substring(0, 200)}...
                    </p>
                  </div>

                  <button
                    onClick={() => setShowResults(true)}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  >
                    View Full Results
                  </button>
                </div>
              ) : (
                <div className="text-center text-gray-500 mt-20">
                  <p className="text-sm">No notes yet</p>
                  <p className="text-xs">Upload a file to see notes here</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === "upload" && (
          <div className="p-4 lg:p-6 mx-2">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-6">
                Upload & Record
              </h2>
              <EnhancedUpload
                onUploadComplete={handleUploadComplete}
                onError={handleUploadError}
              />
            </div>
          </div>
        )}

        {activeSection === "management" && (
          <div className="mx-2">
            <ManagementPage
              user={user}
              onBackToMain={() => setActiveSection("chat")}
              onLogout={onLogout}
            />
          </div>
        )}
      </div>

      {/* Results Modal */}
      {showResults && currentNote && (
        <ResultsDisplay
          result={currentNote}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  );
};

export default MainDashboard;
