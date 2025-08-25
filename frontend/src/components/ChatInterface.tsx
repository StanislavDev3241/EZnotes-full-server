import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, Upload, MessageSquare } from "lucide-react";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

interface ChatInterfaceProps {
  user: any;
  onLogout: () => void;
  noteContext?: {
    conversationId?: number;
    noteId?: number;
    fileName?: string;
    notes?: any;
  };
  onConversationUpdate?: (conversationId: number) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  user, 
  onLogout, 
  noteContext,
  onConversationUpdate 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(
    noteContext?.conversationId || null
  );
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null
  );
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize media recorder
  useEffect(() => {
    let stream: MediaStream | null = null;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((mediaStream) => {
          stream = mediaStream;
          const recorder = new MediaRecorder(mediaStream);
          setMediaRecorder(recorder);
        })
        .catch((err) => {
          console.error("Error accessing microphone:", err);
        });
    }

    // Cleanup function
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (mediaRecorder) {
        mediaRecorder.stop();
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load existing conversation history
  const loadConversationHistory = async (conversationId: number) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/chat/conversation/${conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.messages) {
          const formattedMessages: Message[] = data.messages.map((msg: any) => ({
            id: msg.id.toString(),
            content: msg.sender_type === "user" ? msg.message_text : (msg.ai_response || msg.message_text),
            role: msg.sender_type === "user" ? "user" : "assistant",
            timestamp: new Date(msg.created_at),
          }));
          setMessages(formattedMessages);
          console.log(`Loaded ${formattedMessages.length} messages from conversation ${conversationId}`);
        }
      }
    } catch (error) {
      console.error("Failed to load conversation history:", error);
    }
  };

  // Load conversation history when component mounts or conversationId changes
  useEffect(() => {
    if (currentConversationId) {
      loadConversationHistory(currentConversationId);
    }
  }, [currentConversationId]);

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
      // Prepare conversation context and history
      const conversationContext = {
        conversationId: currentConversationId,
        noteId: noteContext?.noteId,
        fileName: noteContext?.fileName,
        notes: noteContext?.notes,
      };

      // Format conversation history for the backend (last 20 messages for context)
      const conversationHistory = messages.slice(-20).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      console.log(`Sending message with conversation context:`, {
        conversationId: currentConversationId,
        noteId: noteContext?.noteId,
        historyLength: conversationHistory.length,
      });

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
        },
        body: JSON.stringify({
          message: content.trim(),
          noteContext: conversationContext,
          conversationHistory: conversationHistory,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update conversation ID if this is a new conversation
        if (data.conversationId && !currentConversationId) {
          setCurrentConversationId(data.conversationId);
          onConversationUpdate?.(data.conversationId);
          console.log(`New conversation created: ${data.conversationId}`);
        }

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
      scrollToBottom();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputMessage);
  };

  const startRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "inactive") {
      setAudioChunks([]);
      mediaRecorder.start();
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleRecordingData = (event: BlobEvent) => {
    setAudioChunks((prev) => [...prev, event.data]);
  };

  const handleRecordingStop = async () => {
    if (audioChunks.length > 0) {
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      const formData = new FormData();
      formData.append("audio", audioBlob);
      formData.append("userId", user.id);

      try {
        const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          sendMessage(data.transcription);
        }
      } catch (error) {
        console.error("Transcription error:", error);
      }
    }
  };

  useEffect(() => {
    if (mediaRecorder) {
      mediaRecorder.ondataavailable = handleRecordingData;
      mediaRecorder.onstop = handleRecordingStop;
    }
  }, [mediaRecorder, audioChunks]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <MessageSquare className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                AI Dental Assistant
              </h1>
              <p className="text-sm text-gray-500">
                {user ? `Welcome, ${user.name || user.email}` : "Guest User"}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
            >
              <Upload className="h-4 w-4 inline mr-2" />
              Upload File
            </button>
            <button
              onClick={onLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Chat Messages - Full Height */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-20 max-w-2xl mx-auto">
            <MessageSquare className="h-20 w-20 mx-auto mb-6 text-gray-300" />
            <h3 className="text-2xl font-medium mb-4">Start a conversation</h3>
            <p className="text-lg mb-8 text-gray-600">
              Ask me anything about medical notes or upload files for analysis
            </p>

            {/* Quick Action Buttons - Better Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              <p className="text-sm text-gray-400 mb-4 col-span-full">
                Quick actions:
              </p>
              <button
                onClick={() => setInputMessage("Generate SOAP note")}
                className="p-6 text-left bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                <div className="font-medium mb-2">Generate SOAP Note</div>
                <div className="text-sm text-blue-600">
                  Create a complete SOAP note from transcription
                </div>
              </button>
              <button
                onClick={() => setInputMessage("Help me improve my SOAP note")}
                className="p-6 text-left bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-200 transition-colors"
              >
                <div className="font-medium mb-2">Improve SOAP Note</div>
                <div className="text-sm text-green-600">
                  Get suggestions to enhance your notes
                </div>
              </button>
              <button
                onClick={() =>
                  setInputMessage("What information is missing from my note?")
                }
                className="p-6 text-left bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 border border-yellow-200 transition-colors"
              >
                <div className="font-medium mb-2">
                  Check Missing Information
                </div>
                <div className="text-sm text-yellow-600">
                  Identify gaps in your documentation
                </div>
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-2xl lg:max-w-4xl px-6 py-4 rounded-xl shadow-sm ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-900 border border-gray-200"
                }`}
              >
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </div>
                </div>
                <div
                  className={`text-xs mt-3 ${
                    message.role === "user" ? "text-blue-100" : "text-gray-500"
                  }`}
                >
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-900 border border-gray-200 px-6 py-4 rounded-xl shadow-sm">
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce"></div>
                <div
                  className="w-3 h-3 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></div>
                <div
                  className="w-3 h-3 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Better Spacing */}
      <div className="bg-white border-t border-gray-200 px-6 py-6">
        <form
          onSubmit={handleSubmit}
          className="flex space-x-4 max-w-4xl mx-auto"
        >
          <div className="flex-1 flex space-x-3">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message or ask about SOAP notes..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-4 py-3 rounded-lg transition-colors ${
                isRecording
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-gray-600 text-white hover:bg-gray-700"
              }`}
            >
              {isRecording ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          </div>
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
