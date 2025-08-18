import { useState, useRef, useEffect } from "react";
import { LogOut } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
}

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

interface MainDashboardProps {
  user: User;
  onLogout: () => void;
}

const MainDashboard: React.FC<MainDashboardProps> = ({ user, onLogout }) => {
  const [activeSection, setActiveSection] = useState<"chat" | "upload" | "recording">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingInterval = useRef<number>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          const recorder = new MediaRecorder(stream);
          mediaRecorder.current = recorder;
        })
        .catch((err) => {
          console.error("Error accessing microphone:", err);
        });
    }

    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, []);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      role: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
        },
        body: JSON.stringify({
          message: content.trim(),
          userId: user.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.response,
          role: "assistant",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error("Failed to get response");
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, I encountered an error. Please try again.",
        role: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "inactive") {
      audioChunks.current = [];
      mediaRecorder.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingInterval.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
      setIsRecording(false);
      
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
      
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-blue-600">ClearlyAI</h1>
              <p className="text-gray-600">Medical Notes Generator</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-900">{user.name}</span>
              <button
                onClick={onLogout}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                <LogOut className="h-4 w-4 mr-2 inline" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveSection("chat")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeSection === "chat"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Chat with AI
            </button>
            <button
              onClick={() => setActiveSection("upload")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeSection === "upload"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Upload Files
            </button>
            <button
              onClick={() => setActiveSection("recording")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeSection === "recording"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Audio Recording
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Chat Section */}
        {activeSection === "chat" && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Chat with AI</h2>
            
            <div className="h-96 overflow-y-auto mb-4 border border-gray-200 rounded-lg p-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 mt-20">
                  <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
                  <p className="text-sm">Ask me anything about medical notes</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} mb-4`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start mb-4">
                  <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex space-x-3">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage(inputMessage)}
                disabled={!inputMessage.trim() || isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Upload Section */}
        {activeSection === "upload" && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Medical Files</h2>
            
            <div className="space-y-4">
              <input
                type="file"
                onChange={handleFileSelect}
                accept="audio/*,text/plain,application/pdf"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {file && (
                <p className="text-sm text-gray-600">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
              <button
                disabled={!file}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Upload and Process
              </button>
            </div>
          </div>
        )}

        {/* Recording Section */}
        {activeSection === "recording" && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Audio Recording</h2>
            
            <div className="text-center space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {isRecording ? "Recording..." : "Ready to Record"}
                </h3>
                {isRecording && (
                  <div className="text-4xl font-mono text-red-600">
                    {formatTime(recordingTime)}
                  </div>
                )}
              </div>

              <div className="flex justify-center space-x-4">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Start Recording
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    Stop Recording
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MainDashboard; 