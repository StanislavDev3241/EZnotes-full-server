import React, { useState, useRef, useEffect } from "react";
import { Trash2, Save, Download, FileText } from "lucide-react";
import EnhancedUpload from "./EnhancedUpload";
import ResultsDisplay from "./ResultsDisplay";
import EnhancedMessage from "./EnhancedMessage";
import ChatHistoryManager from "./ChatHistoryManager";
import NoteManagement from "./NoteManagement";
import FileManagement from "./FileManagement";

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
  noteId: string;
  conversationId: string;
  fileName: string;
  status: string;
  transcription: string;
  notes: {
    soapNote: string;
    patientSummary: string;
  };
  customPrompt?: string;
  selectedNoteTypes?: ("soap" | "summary")[];
}

interface MainDashboardProps {
  user: User | null;
  onLogout: () => void;
  isUnregisteredUser?: boolean;
  onBackToLanding?: () => void;
  onShowLogin?: () => void;
}

const MainDashboard: React.FC<MainDashboardProps> = ({
  user,
  onLogout,
  isUnregisteredUser = false,
  onBackToLanding,
  onShowLogin,
}) => {
  const [activeSection, setActiveSection] = useState<
    "chat" | "upload" | "management"
  >("upload"); // Default to upload for unregistered users

  // Guard function to prevent unregistered users from accessing restricted sections
  const setActiveSectionWithGuard = (
    section: "chat" | "upload" | "management"
  ) => {
    if (
      isUnregisteredUser &&
      (section === "chat" || section === "management")
    ) {
      // Show message that this feature requires registration
      alert(
        "This feature requires registration. Please sign up to access chat and management features."
      );
      return;
    }
    setActiveSection(section);
  };

  // For unregistered users, only show upload section
  useEffect(() => {
    if (isUnregisteredUser) {
      setActiveSection("upload");
    }
  }, [isUnregisteredUser]);

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
  const [showFullNotes, setShowFullNotes] = useState(false);

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
      setCurrentConversationId(result.conversationId);
      setShowResults(true);
    }
  };

  const handleChatChoice = (choice: "new" | "continue") => {
    if (choice === "new") {
      // Create new chat - clear current messages and set new note
      setMessages([]);
      setCurrentNote(pendingUpload);
      setCurrentConversationId(pendingUpload?.conversationId || null);
      setShowResults(true);
    } else {
      // Continue with current chat - just show results
      setShowResults(true);
    }

    // Reset the choice dialog
    setShowChatChoice(false);
    setPendingUpload(null);
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
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
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

      const result = await response.json();

      if (result.success) {
        // Add AI response to messages
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: result.response,
          sender: "ai",
          timestamp: new Date(),
          noteContext: currentNote,
        };

        setMessages((prev) => [...prev, aiMessage]);

        // Update conversation ID if this is a new conversation
        if (result.conversationId && !currentConversationId) {
          setCurrentConversationId(result.conversationId);
        }
      } else {
        throw new Error(result.message || "Failed to get AI response");
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      // Add error message to chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I encountered an error. Please try again.",
        sender: "ai",
        timestamp: new Date(),
        noteContext: currentNote,
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

          const result = await response.json();

          if (result.success) {
            // Add the new AI response after the edited message
            const aiMessage: Message = {
              id: (Date.now() + 1).toString(),
              text: result.response,
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

            // Update conversation ID if this is a new conversation
            if (result.conversationId && !currentConversationId) {
              setCurrentConversationId(result.conversationId);
            }
          } else {
            throw new Error(result.message || "Failed to get AI response");
          }
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

  const handleSaveNote = async (
    content: string,
    noteType: string,
    noteName?: string
  ) => {
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
          noteName: noteName || noteType,
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

  const handleContinueFromHistory = async (
    conversationId: string,
    historyMessages: any[]
  ) => {
    try {
      // Load conversation details to get note context
      const response = await fetch(
        `${API_BASE_URL}/api/chat/conversation/${conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load conversation");
      }

      const conversationData = await response.json();

      // Set current conversation ID
      setCurrentConversationId(conversationId);

      // If we have a note ID from the conversation, load the note context first
      if (conversationData.note_id) {
        await loadNoteContext(conversationData.note_id);
      }

      // Convert history messages to our Message format with proper note context
      const convertedMessages = historyMessages.map((msg) => ({
        id: msg.id.toString(),
        text:
          msg.sender_type === "user"
            ? msg.message_text
            : msg.ai_response || msg.message_text,
        sender: msg.sender_type === "user" ? "user" : ("ai" as "user" | "ai"),
        timestamp: new Date(msg.created_at),
        noteContext: currentNote, // This will be updated after loadNoteContext
      }));

      setMessages(convertedMessages);

      // Switch to chat section
      setActiveSectionWithGuard("chat");
    } catch (error) {
      console.error("Failed to continue from history:", error);
      alert("Failed to load conversation history. Please try again.");
    }
  };

  // Load note context for a conversation
  const loadNoteContext = async (noteId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
        },
      });

      if (response.ok) {
        const noteData = await response.json();

        // Parse the note content to extract SOAP note and patient summary
        let parsedNotes = { soapNote: "", patientSummary: "" };
        try {
          if (noteData.content) {
            const contentObj = JSON.parse(noteData.content);
            parsedNotes = {
              soapNote: contentObj.soapNote || noteData.content,
              patientSummary: contentObj.patientSummary || noteData.content,
            };
          }
        } catch (parseError) {
          console.warn(
            "Failed to parse note content as JSON, using as string:",
            parseError
          );
          // Fallback: use the content as both SOAP note and patient summary
          parsedNotes = {
            soapNote: noteData.content || "",
            patientSummary: noteData.content || "",
          };
        }

        // Determine selected note types based on note type
        let selectedNoteTypes: ("soap" | "summary")[] = [];
        if (noteData.note_type?.toLowerCase().includes("soap")) {
          selectedNoteTypes.push("soap");
        }
        if (
          noteData.note_type?.toLowerCase().includes("patient") ||
          noteData.note_type?.toLowerCase().includes("summary")
        ) {
          selectedNoteTypes.push("summary");
        }
        // If no specific type detected, assume both
        if (selectedNoteTypes.length === 0) {
          selectedNoteTypes = ["soap", "summary"];
        }

        // Create a note context object that matches our UploadResult interface
        const noteContext = {
          fileId: noteData.file_id?.toString() || "",
          noteId: noteData.id?.toString() || "",
          conversationId: currentConversationId || "",
          fileName: noteData.filename || `Note ${noteData.id}`,
          status: "completed",
          transcription: noteData.transcription || "",
          notes: parsedNotes,
          selectedNoteTypes: selectedNoteTypes,
        };

        console.log("Loaded note context:", noteContext);
        setCurrentNote(noteContext);
      }
    } catch (error) {
      console.error("Failed to load note context:", error);
    }
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
          userId: user?.id,
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
        `${API_BASE_URL}/api/chat/conversation/${pointId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (response.ok) {
        console.log(`Chat conversation ${pointId} deleted`);
        // Refresh the chat history by triggering a reload
        // The ChatHistoryManager will reload when expanded
      } else {
        throw new Error("Failed to delete chat conversation");
      }
    } catch (error) {
      console.error("Failed to delete chat conversation:", error);
      alert("Failed to delete chat conversation. Please try again.");
    }
  };

  const loadFileNotes = async (fileId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/notes/file/${fileId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load file notes");
      }

      const data = await response.json();
      const notes = data.notes || [];

      if (notes.length > 0) {
        // Create a note context from the first note
        const firstNote = notes[0];

        // Parse the note content to extract SOAP note and patient summary
        let parsedNotes = { soapNote: "", patientSummary: "" };
        try {
          if (firstNote.content) {
            const contentObj = JSON.parse(firstNote.content);
            parsedNotes = {
              soapNote: contentObj.soapNote || firstNote.content,
              patientSummary: contentObj.patientSummary || firstNote.content,
            };
          }
        } catch (parseError) {
          // If parsing fails, use the content as is
          parsedNotes = {
            soapNote: firstNote.content || "",
            patientSummary: firstNote.content || "",
          };
        }

        // Determine selected note types based on the notes
        const selectedNoteTypes: ("soap" | "summary")[] = [];
        notes.forEach((note: any) => {
          if (note.note_type === "soap_note") {
            selectedNoteTypes.push("soap");
          } else if (note.note_type === "patient_summary") {
            selectedNoteTypes.push("summary");
          }
        });

        // Create a note context object
        const noteContext = {
          fileId: fileId,
          noteId: firstNote.id?.toString() || "",
          conversationId: "",
          fileName: firstNote.filename || `File ${fileId}`,
          status: "completed",
          transcription: firstNote.transcription || "",
          notes: parsedNotes,
          selectedNoteTypes: selectedNoteTypes,
        };

        // Set the current note and show results
        setCurrentNote(noteContext);
        setShowResults(true);

        // Switch to chat section to show the notes
        setActiveSectionWithGuard("chat");
      } else {
        alert("No notes found for this file.");
      }
    } catch (error) {
      console.error("Failed to load file notes:", error);
      alert("Failed to load file notes. Please try again.");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-900">ClearlyAI</h1>
            {user ? (
              <span className="text-sm text-gray-500">
                Welcome, {user.name} ({user.role})
              </span>
            ) : (
              <span className="text-sm text-gray-500">
                Guest User - Try ClearlyAI
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {isUnregisteredUser && onBackToLanding && (
              <button
                onClick={onBackToLanding}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
              >
                ← Back to Home
              </button>
            )}
            {user && (
              <button
                onClick={onLogout}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {!isUnregisteredUser && (
            <button
              onClick={() => setActiveSectionWithGuard("chat")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeSection === "chat"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Chat & Notes
            </button>
          )}
          <button
            onClick={() => setActiveSectionWithGuard("upload")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeSection === "upload"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {isUnregisteredUser ? "Upload & Generate Notes" : "Upload & Record"}
          </button>
          {!isUnregisteredUser && (
            <button
              onClick={() => setActiveSectionWithGuard("management")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeSection === "management"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Management
            </button>
          )}
        </nav>
      </div>

      {/* Main Content - Account for header height */}
      <div className="flex-1 overflow-y-auto pt-2">
        {activeSection === "chat" && (
          <div className="flex flex-col lg:flex-row h-full gap-6 px-6 pb-6">
            {/* Chat Interface - Left Side */}
            <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm min-h-0">
              {/* Chat History Manager - Smaller footprint */}
              <div className="p-2 border-b border-gray-200">
                <ChatHistoryManager
                  userId={user?.id || 0}
                  onContinueFromHistory={handleContinueFromHistory}
                  onSaveHistoryPoint={handleSaveHistoryPoint}
                  onDeleteHistoryPoint={handleDeleteHistoryPoint}
                  currentConversationId={currentConversationId || undefined}
                />
              </div>

              {/* Chat Interface - More space for conversation */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Current Note Context Display - Compact */}
                {currentNote && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mx-3 mt-2 mb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-blue-900 text-sm sm:text-base">
                          Current Note Context:
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowFullNotes(!showFullNotes)}
                          className="text-blue-600 hover:text-blue-800 text-sm self-start sm:self-auto"
                        >
                          {showFullNotes
                            ? "Hide Full Notes"
                            : "View Full Notes"}
                        </button>
                        <button
                          onClick={() => setCurrentNote(null)}
                          className="text-blue-600 hover:text-blue-800 text-sm self-start sm:self-auto"
                        >
                          Clear Context
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs sm:text-sm text-blue-800">
                      <p>
                        <strong>File:</strong> {currentNote.fileName}
                      </p>
                      <p>
                        <strong>Type:</strong>{" "}
                        {currentNote.fileName.split(".").pop() || "Unknown"}
                      </p>
                      {currentNote.transcription && (
                        <div className="mt-2 p-3 bg-white rounded border border-gray-300">
                          <h4 className="font-semibold text-gray-900 mb-2">
                            Transcription:
                          </h4>
                          <div className="text-xs text-gray-800 max-h-24 overflow-y-auto p-2 bg-gray-50 rounded">
                            <pre className="whitespace-pre-wrap">
                              {currentNote.transcription}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Show only selected note types */}
                      {currentNote.selectedNoteTypes?.includes("soap") &&
                        currentNote.notes &&
                        currentNote.notes.soapNote && (
                          <div className="mt-3 p-3 bg-white rounded border border-blue-300">
                            <h4 className="font-semibold text-blue-900 mb-2">
                              SOAP Note:
                            </h4>
                            <div className="text-xs text-blue-800 max-h-32 overflow-y-auto p-2 bg-blue-50 rounded">
                              <pre className="whitespace-pre-wrap">
                                {currentNote.notes.soapNote}
                              </pre>
                            </div>
                          </div>
                        )}

                      {currentNote.selectedNoteTypes?.includes("summary") &&
                        currentNote.notes &&
                        currentNote.notes.patientSummary && (
                          <div className="mt-2 p-3 bg-white rounded border border-green-300">
                            <h4 className="font-semibold text-green-900 mb-2">
                              Patient Summary:
                            </h4>
                            <div className="text-xs text-green-800 max-h-20 overflow-y-auto p-2 bg-green-50 rounded">
                              <pre className="whitespace-pre-wrap">
                                {currentNote.notes.patientSummary}
                              </pre>
                            </div>
                          </div>
                        )}

                      {/* Full Notes Display */}
                      {showFullNotes && currentNote.notes && (
                        <div className="mt-3 p-4 bg-white rounded border border-gray-300">
                          <h4 className="font-semibold text-gray-900 mb-3">
                            Complete Notes:
                          </h4>

                          {currentNote.selectedNoteTypes?.includes("soap") &&
                            currentNote.notes.soapNote && (
                              <div className="mb-4">
                                <h5 className="font-medium text-blue-900 mb-2">
                                  Full SOAP Note:
                                </h5>
                                <div className="text-xs text-gray-800 max-h-96 overflow-y-auto p-3 bg-gray-50 rounded border">
                                  <pre className="whitespace-pre-wrap">
                                    {currentNote.notes.soapNote}
                                  </pre>
                                </div>
                              </div>
                            )}

                          {currentNote.selectedNoteTypes?.includes("summary") &&
                            currentNote.notes.patientSummary && (
                              <div>
                                <h5 className="font-medium text-green-900 mb-2">
                                  Full Patient Summary:
                                </h5>
                                <div className="text-xs text-gray-800 max-h-64 overflow-y-auto p-3 bg-gray-50 rounded border">
                                  <pre className="whitespace-pre-wrap">
                                    {currentNote.notes.patientSummary}
                                  </pre>
                                </div>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Chat Messages - Improved Layout with more space */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-[400px]">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20 max-w-2xl mx-auto">
                      <div className="mb-6">
                        <svg
                          className="h-16 w-16 mx-auto text-gray-300"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-xl font-medium mb-2">
                        Start a conversation
                      </h3>
                      <p className="text-gray-600 mb-6">
                        Upload a file or start recording to begin chatting with
                        AI
                      </p>

                      {/* Quick Action Buttons - Dynamic based on note context */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg mx-auto">
                        {currentNote?.selectedNoteTypes?.includes("soap") && (
                          <button
                            onClick={() =>
                              setInputMessage("Generate SOAP note")
                            }
                            className="p-4 text-left bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
                          >
                            <div className="font-medium mb-1">
                              Generate SOAP Note
                            </div>
                            <div className="text-sm text-blue-600">
                              Create complete SOAP notes
                            </div>
                          </button>
                        )}
                        {currentNote?.selectedNoteTypes?.includes(
                          "summary"
                        ) && (
                          <button
                            onClick={() =>
                              setInputMessage("Generate patient summary")
                            }
                            className="p-4 text-left bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-200 transition-colors"
                          >
                            <div className="font-medium mb-1">
                              Generate Patient Summary
                            </div>
                            <div className="text-sm text-green-600">
                              Create patient-friendly summary
                            </div>
                          </button>
                        )}
                        {(currentNote?.selectedNoteTypes?.includes("soap") ||
                          currentNote?.selectedNoteTypes?.includes(
                            "summary"
                          )) && (
                          <button
                            onClick={() =>
                              setInputMessage("Help me improve my notes")
                            }
                            className="p-4 text-left bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 border border-yellow-200 transition-colors"
                          >
                            <div className="font-medium mb-1">
                              Improve Notes
                            </div>
                            <div className="text-sm text-yellow-600">
                              Get enhancement suggestions
                            </div>
                          </button>
                        )}
                        {!currentNote && (
                          <>
                            <button
                              onClick={() =>
                                setInputMessage("Generate SOAP note")
                              }
                              className="p-4 text-left bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
                            >
                              <div className="font-medium mb-1">
                                Generate SOAP Note
                              </div>
                              <div className="text-sm text-blue-600">
                                Create complete SOAP notes
                              </div>
                            </button>
                            <button
                              onClick={() =>
                                setInputMessage("Generate patient summary")
                              }
                              className="p-4 text-left bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-200 transition-colors"
                            >
                              <div className="font-medium mb-1">
                                Generate Patient Summary
                              </div>
                              <div className="text-sm text-green-600">
                                Create patient-friendly summary
                              </div>
                            </button>
                          </>
                        )}
                      </div>
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
                      <div className="bg-gray-100 text-gray-800 px-4 py-3 rounded-lg shadow-sm">
                        <div className="flex items-center space-x-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div
                              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                              style={{ animationDelay: "0.1s" }}
                            ></div>
                            <div
                              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                              style={{ animationDelay: "0.2s" }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-600">
                            AI is thinking...
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat Input - Improved Layout */}
                <div className="border-t bg-white p-6">
                  {/* Chat Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex flex-wrap gap-2">
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
                        className="flex items-center px-2 py-1 text-xs sm:text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                      >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
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
                            className="flex items-center px-2 py-1 text-xs sm:text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                          >
                            <Save className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
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
                            className="flex items-center px-2 py-1 text-xs sm:text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                          >
                            <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            Download All
                          </button>
                        </>
                      )}
                      {/* New Save Notes Button */}
                      <button
                        onClick={() => setShowSaveNotesDialog(true)}
                        className="flex items-center px-2 py-1 text-xs sm:text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      >
                        <Save className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                        Save Notes
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 self-start sm:self-auto">
                      {messages.length} messages
                    </div>
                  </div>

                  <div className="flex flex-col space-y-3">
                    <textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask me about the uploaded content or request improvements..."
                      className="w-full resize-none border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base min-h-[120px]"
                      rows={5}
                    />
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-gray-500">
                        Press Enter to send, Shift+Enter for new line
                      </div>
                      <button
                        onClick={sendMessage}
                        disabled={!inputMessage.trim() || isLoading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        Send Message
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Display - Right Side */}
            <div className="w-full lg:w-80 bg-gray-50 border-t lg:border-l lg:border-t-0 p-4 lg:p-6 overflow-y-auto rounded-lg min-h-0">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Current Notes
              </h3>
              {currentNote ? (
                <div className="space-y-4">
                  <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm">
                    <h4 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">
                      File: {currentNote.fileName}
                    </h4>
                    {currentNote.customPrompt && (
                      <div className="mb-3">
                        <h5 className="font-medium text-gray-900 mb-2 text-sm">
                          Custom Prompt:
                        </h5>
                        <div className="text-xs text-gray-700 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded border">
                          <pre className="whitespace-pre-wrap">
                            {currentNote.customPrompt}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm">
                    <h4 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">
                      SOAP Note
                    </h4>
                    <div className="text-xs sm:text-sm text-gray-700 max-h-48 overflow-y-auto p-2 bg-gray-50 rounded border">
                      <pre className="whitespace-pre-wrap">
                        {currentNote.notes.soapNote}
                      </pre>
                    </div>
                  </div>

                  <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm">
                    <h4 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">
                      Patient Summary
                    </h4>
                    <div className="text-xs sm:text-sm text-gray-700 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded border">
                      <pre className="whitespace-pre-wrap">
                        {currentNote.notes.patientSummary}
                      </pre>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowResults(true)}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors text-sm"
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

        {/* Upload Section */}
        {activeSection === "upload" && (
          <div className="space-y-6 px-4 pb-6">
            {isUnregisteredUser && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-blue-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      Try ClearlyAI for Free
                    </h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>
                        Upload your transcription or audio files to generate
                        AI-powered SOAP notes and patient summaries.
                        <button
                          onClick={() => onShowLogin && onShowLogin()}
                          className="ml-1 font-medium underline hover:text-blue-600"
                        >
                          Sign up
                        </button>{" "}
                        to unlock chat functionality, save notes, and access
                        your full history.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <EnhancedUpload
              onUploadComplete={handleUploadComplete}
              onError={(error) => console.error("Upload error:", error)}
              isUnregisteredUser={isUnregisteredUser}
              onShowSignup={() => onShowLogin && onShowLogin()}
              API_BASE_URL={API_BASE_URL}
            />
          </div>
        )}

        {activeSection === "management" && (
          <div className="px-4 pb-6">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900">
                  Management & History
                </h2>
                <button
                  onClick={() => setActiveSectionWithGuard("chat")}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  ← Back to Chat
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Note Management */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <NoteManagement
                    userId={user?.id || 0}
                    onSelectNote={(note) => {
                      // Handle note selection
                      console.log("Selected note:", note);
                    }}
                    onLoadConversation={(conversationId) => {
                      // Load conversation and sync current notes
                      handleContinueFromHistory(conversationId.toString(), []);
                    }}
                  />
                </div>

                {/* Right Column - File Management */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <FileManagement
                    userId={user?.id || 0}
                    onSelectFile={(file) => {
                      // Handle file selection
                      console.log("Selected file:", file);
                    }}
                    onLoadFileNotes={(fileId) => {
                      // Load notes for this file
                      loadFileNotes(fileId.toString());
                    }}
                  />
                </div>
              </div>
            </div>
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
            setActiveSectionWithGuard("chat");
            // Add the AI's response based on selected note types
            const messages: Message[] = [];

            if (
              currentNote.selectedNoteTypes?.includes("soap") &&
              currentNote.notes?.soapNote
            ) {
              messages.push({
                id: Date.now().toString(),
                text: currentNote.notes.soapNote,
                sender: "ai",
                timestamp: new Date(),
                noteContext: currentNote,
              });
            }

            if (
              currentNote.selectedNoteTypes?.includes("summary") &&
              currentNote.notes?.patientSummary
            ) {
              messages.push({
                id: (Date.now() + 1).toString(),
                text: currentNote.notes.patientSummary,
                sender: "ai",
                timestamp: new Date(),
                noteContext: currentNote,
              });
            }

            if (messages.length > 0) {
              setMessages(messages);
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Save Notes
            </h3>
            <p className="text-gray-600 mb-6 text-sm sm:text-base">
              Edit your notes content and provide a name. You can create a new
              note or update an existing one.
            </p>

            <div className="space-y-6">
              {/* Note Details Section */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Note Name *
                  </label>
                  <input
                    type="text"
                    id="notesNameInput"
                    placeholder="Enter a descriptive name (e.g., 'SOAP Note - Patient X')"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Note Type *
                  </label>
                  <select
                    id="noteTypeSelect"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                  >
                    {currentNote?.selectedNoteTypes?.includes("soap") && (
                      <option value="soap_note">SOAP Note</option>
                    )}
                    {currentNote?.selectedNoteTypes?.includes("summary") && (
                      <option value="patient_summary">Patient Summary</option>
                    )}
                    <option value="complete_conversation">
                      Complete Conversation
                    </option>
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
                      <span className="text-sm">
                        Update Existing Note (if name exists)
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Note Content Editor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note Content *
                </label>
                <textarea
                  id="noteContentInput"
                  rows={8}
                  placeholder="Edit your note content here..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm sm:text-base"
                  defaultValue={(() => {
                    // Pre-fill with AI messages content
                    return messages
                      .filter((msg) => msg.sender === "ai")
                      .map((msg) => msg.text)
                      .join("\n\n---\n\n");
                  })()}
                />
                <p className="text-xs text-gray-500 mt-1">
                  You can edit this content before saving. All AI responses from
                  the current conversation are included.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowSaveNotesDialog(false)}
                className="w-full sm:w-auto px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const notesName = (
                    document.getElementById(
                      "notesNameInput"
                    ) as HTMLInputElement
                  )?.value;
                  const noteType = (
                    document.getElementById(
                      "noteTypeSelect"
                    ) as HTMLSelectElement
                  )?.value;
                  const noteContent = (
                    document.getElementById(
                      "noteContentInput"
                    ) as HTMLTextAreaElement
                  )?.value;
                  const saveAction = (
                    document.querySelector(
                      'input[name="saveAction"]:checked'
                    ) as HTMLInputElement
                  )?.value;

                  if (
                    notesName &&
                    notesName.trim() &&
                    noteContent &&
                    noteContent.trim()
                  ) {
                    // Handle create vs update logic
                    if (saveAction === "update") {
                      // Try to update existing note, fallback to create if not found
                      handleSaveNote(
                        noteContent.trim(),
                        notesName.trim(),
                        noteType
                      );
                    } else {
                      // Always create new note
                      handleSaveNote(
                        noteContent.trim(),
                        notesName.trim(),
                        noteType
                      );
                    }
                    setShowSaveNotesDialog(false);
                  } else {
                    alert(
                      "Please fill in all required fields (Note Name and Note Content)."
                    );
                  }
                }}
                className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
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
