import { useState, useRef, useEffect } from "react";
import { LogOut, Trash2, Save, Download, FileText } from "lucide-react";
import EnhancedUpload from "./EnhancedUpload";
import ResultsDisplay from "./ResultsDisplay";
import ManagementPage from "./ManagementPage";
import EnhancedMessage from "./EnhancedMessage";
import ChatHistoryManager from "./ChatHistoryManager";

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
  const [showChatChoice, setShowChatChoice] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<UploadResult | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [showSaveNotesDialog, setShowSaveNotesDialog] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle upload completion
  const handleUploadComplete = (result: UploadResult) => {
    // Check if there's already a current note
    if (currentNote) {
      // Ask user what to do with the new upload
      setPendingUpload(result);
      setShowChatChoice(true);
    } else {
      // No current note, set it directly
      setCurrentNote(result);
      setShowResults(true);
    }
  };

  const handleChatChoice = (choice: "new" | "continue") => {
    if (choice === "new") {
      // Create new chat - clear current messages and set new note
      setMessages([]);
      setCurrentNote(pendingUpload);
      setShowResults(true);
    } else {
      // Continue with current chat - just show results
      setShowResults(true);
    }

    // Reset the choice dialog
    setShowChatChoice(false);
    setPendingUpload(null);
  };

  const handleUploadError = (error: string) => {
    console.error("Upload error:", error);
    // You can add a toast notification here if needed
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

  // Enhanced message handling functions
  const handleEditMessage = async (messageId: string, newText: string) => {
    try {
      // Update message in local state
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, text: newText } : msg
        )
      );

      // Find the edited message and get conversation context
      const editedMessageIndex = messages.findIndex(
        (msg) => msg.id === messageId
      );
      if (editedMessageIndex !== -1) {
        // Get conversation history up to the edited message
        const conversationHistory = messages.slice(0, editedMessageIndex + 1);

        // Send the edited message to get a new AI response
        setIsLoading(true);

        try {
          const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("userToken")}`,
            },
            body: JSON.stringify({
              message: newText,
              noteContext: currentNote,
              conversationHistory: conversationHistory.slice(-10), // Send last 10 messages for context
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to get AI response");
          }

          const aiResponse = await response.json();

          // Add the new AI response after the edited message
          const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            text: aiResponse.response,
            sender: "ai",
            timestamp: new Date(),
            noteContext: currentNote,
          };

          // Insert AI response after the edited message
          setMessages((prev) => {
            const newMessages = [...prev];
            newMessages.splice(editedMessageIndex + 1, 0, aiMessage);
            return newMessages;
          });
        } catch (error) {
          console.error("Failed to get AI response for edited message:", error);
        } finally {
          setIsLoading(false);
        }
      }

      // TODO: Send update to backend for persistence
      console.log(`Message ${messageId} edited to: ${newText}`);
    } catch (error) {
      console.error("Failed to edit message:", error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      try {
        // Remove message from local state
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

        // TODO: Send delete request to backend
        console.log(`Message ${messageId} deleted`);
      } catch (error) {
        console.error("Failed to delete message:", error);
      }
    }
  };

  const handleSaveNote = async (content: string, noteType: string, noteName?: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
        },
        body: JSON.stringify({
          content,
          noteType,
          noteName: noteName || noteType, // Use provided name or fallback to type
          fileId: currentNote?.fileId,
          conversationId: currentConversationId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save note");
      }

      const result = await response.json();
      alert(result.message || "Note saved successfully!");
    } catch (error) {
      console.error("Failed to save note:", error);
      alert("Failed to save note. Please try again.");
    }
  };

  const handleDownloadNote = (content: string, filename: string) => {
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

  const handleContinueFromHistory = (
    conversationId: string,
    historyMessages: any[]
  ) => {
    setCurrentConversationId(conversationId);

    // Convert history messages to our Message format
    const convertedMessages = historyMessages.map((msg) => ({
      id: msg.id.toString(),
      text:
        msg.sender_type === "user"
          ? msg.message_text
          : msg.ai_response || msg.message_text,
      sender: msg.sender_type === "user" ? "user" : ("ai" as "user" | "ai"),
      timestamp: new Date(msg.created_at),
      noteContext: currentNote,
    }));

    setMessages(convertedMessages);
  };

  const handleSaveHistoryPoint = async (name: string, messages: any[]) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/checkpoint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
        },
        body: JSON.stringify({
          name,
          messages,
          conversationId: currentConversationId,
          userId: user.id,
        }),
      });

      if (response.ok) {
        alert("Chat point saved successfully!");
      } else {
        throw new Error("Failed to save chat point");
      }
    } catch (error) {
      console.error("Failed to save chat point:", error);
      alert("Failed to save chat point. Please try again.");
    }
  };

  const handleDeleteHistoryPoint = async (pointId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/chat/checkpoint/${pointId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (response.ok) {
        console.log(`Chat point ${pointId} deleted`);
      } else {
        throw new Error("Failed to delete chat point");
      }
    } catch (error) {
      console.error("Failed to delete chat point:", error);
      alert("Failed to delete chat point. Please try again.");
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
              {/* Chat History Manager */}
              <div className="p-3 border-b border-gray-200">
                <ChatHistoryManager
                  userId={user.id}
                  onContinueFromHistory={handleContinueFromHistory}
                  onSaveHistoryPoint={handleSaveHistoryPoint}
                  onDeleteHistoryPoint={handleDeleteHistoryPoint}
                  currentConversationId={currentConversationId || undefined}
                />
              </div>

              {/* Chat Interface */}
              <div className="flex-1 flex flex-col">
                {/* Current Note Context Display */}
                {currentNote && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-blue-900">
                          Current Note Context:
                        </span>
                      </div>
                      <button
                        onClick={() => setCurrentNote(null)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Clear Context
                      </button>
                    </div>
                    <div className="mt-2 text-sm text-blue-800">
                      <p>
                        <strong>File:</strong> {currentNote.fileName}
                      </p>
                      <p>
                        <strong>Type:</strong>{" "}
                        {currentNote.fileName.split(".").pop() || "Unknown"}
                      </p>
                      {currentNote.transcription && (
                        <p>
                          <strong>Transcription:</strong>{" "}
                          {currentNote.transcription.substring(0, 100)}...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20">
                      <p className="text-lg">No messages yet</p>
                      <p className="text-sm">
                        Upload a file or start recording to begin chatting with
                        AI
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <EnhancedMessage
                        key={message.id}
                        message={message}
                        isOwnMessage={message.sender === "user"}
                        onEditMessage={handleEditMessage}
                        onDeleteMessage={handleDeleteMessage}
                        onSaveNote={handleSaveNote}
                        onDownloadNote={handleDownloadNote}
                      />
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
                  {/* Chat Controls */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              "Are you sure you want to clear the chat?"
                            )
                          ) {
                            setMessages([]);
                            setCurrentConversationId(null);
                          }
                        }}
                        className="flex items-center px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Clear Chat
                      </button>
                      {currentNote && (
                        <>
                          <button
                            onClick={() => {
                              const allContent = messages
                                .filter((msg) => msg.sender === "ai")
                                .map((msg) => msg.text)
                                .join("\n\n---\n\n");
                              handleSaveNote(
                                allContent,
                                "complete_conversation",
                                `Complete Conversation - ${new Date().toLocaleDateString()}`
                              );
                            }}
                            className="flex items-center px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                          >
                            <Save className="w-4 h-4 mr-1" />
                            Save All
                          </button>
                          <button
                            onClick={() => {
                              const allContent = messages
                                .filter((msg) => msg.sender === "ai")
                                .map((msg) => msg.text)
                                .join("\n\n---\n\n");
                              handleDownloadNote(
                                allContent,
                                `chat_${Date.now()}.txt`
                              );
                            }}
                            className="flex items-center px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                          >
                            <Download className="w-4 h-4 mr-1" />
                            Download All
                          </button>
                        </>
                      )}
                      {/* New Save Notes Button */}
                      <button
                        onClick={() => setShowSaveNotesDialog(true)}
                        className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        Save Notes
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">
                      {messages.length} messages
                    </div>
                  </div>

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
                        <strong>Custom Prompt:</strong>{" "}
                        {currentNote.customPrompt}
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
          onNextToChat={() => {
            setShowResults(false);
            setActiveSection("chat");
            // Add the AI's clarification question as the first message
            if (currentNote.notes?.soapNote) {
              const aiMessage: Message = {
                id: Date.now().toString(),
                text: currentNote.notes.soapNote,
                sender: "ai",
                timestamp: new Date(),
                noteContext: currentNote,
              };
              setMessages([aiMessage]);
            }
          }}
        />
      )}

      {/* Chat Choice Dialog */}
      {showChatChoice && pendingUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              New File Uploaded
            </h3>
            <p className="text-gray-600 mb-6">
              You've uploaded a new file:{" "}
              <strong>{pendingUpload.fileName}</strong>
            </p>
            <p className="text-gray-600 mb-6">What would you like to do?</p>

            <div className="flex space-x-3">
              <button
                onClick={() => handleChatChoice("new")}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Create New Chat
              </button>
              <button
                onClick={() => handleChatChoice("continue")}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
              >
                Continue Current Chat
              </button>
            </div>

            <button
              onClick={() => {
                setShowChatChoice(false);
                setPendingUpload(null);
              }}
              className="mt-3 w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Save Notes Dialog */}
      {showSaveNotesDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Save Notes
            </h3>
            <p className="text-gray-600 mb-6">
              Edit your notes content and provide a name. You can create a new note or update an existing one.
            </p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Side - Note Details */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Note Name *
                  </label>
                  <input
                    type="text"
                    id="notesNameInput"
                    placeholder="Enter a descriptive name (e.g., 'SOAP Note - Patient X')"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Note Type *
                  </label>
                  <select
                    id="noteTypeSelect"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="soap_note">SOAP Note</option>
                    <option value="patient_summary">Patient Summary</option>
                    <option value="complete_conversation">Complete Conversation</option>
                    <option value="custom_note">Custom Note</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Action
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="saveAction"
                        value="create"
                        defaultChecked
                        className="mr-2"
                      />
                      <span className="text-sm">Create New Note</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="saveAction"
                        value="update"
                        className="mr-2"
                      />
                      <span className="text-sm">Update Existing Note (if name exists)</span>
                    </label>
                  </div>
                </div>
              </div>
              
              {/* Right Side - Note Content Editor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note Content *
                </label>
                <textarea
                  id="noteContentInput"
                  rows={12}
                  placeholder="Edit your note content here..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  defaultValue={(() => {
                    // Pre-fill with AI messages content
                    return messages
                      .filter((msg) => msg.sender === "ai")
                      .map((msg) => msg.text)
                      .join("\n\n---\n\n");
                  })()}
                />
                <p className="text-xs text-gray-500 mt-1">
                  You can edit this content before saving. All AI responses from the current conversation are included.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowSaveNotesDialog(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const notesName = (
                    document.getElementById("notesNameInput") as HTMLInputElement
                  )?.value;
                  const noteType = (
                    document.getElementById("noteTypeSelect") as HTMLSelectElement
                  )?.value;
                  const noteContent = (
                    document.getElementById("noteContentInput") as HTMLTextAreaElement
                  )?.value;
                  const saveAction = (
                    document.querySelector('input[name="saveAction"]:checked') as HTMLInputElement
                  )?.value;
                  
                  if (notesName && notesName.trim() && noteContent && noteContent.trim()) {
                    // Handle create vs update logic
                    if (saveAction === "update") {
                      // Try to update existing note, fallback to create if not found
                      handleSaveNote(noteContent.trim(), notesName.trim(), noteType);
                    } else {
                      // Always create new note
                      handleSaveNote(noteContent.trim(), notesName.trim(), noteType);
                    }
                    setShowSaveNotesDialog(false);
                  } else {
                    alert("Please fill in all required fields (Note Name and Note Content).");
                  }
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainDashboard;
