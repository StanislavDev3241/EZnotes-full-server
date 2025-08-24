import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  FileText,
  Mic,
  Clock,
  Download,
  Eye,
  Search,
  Calendar,
  User,
  Trash2,
} from "lucide-react";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface ChatMessage {
  sender_type: string;
  message_text: string;
  ai_response: string;
  created_at: string;
}

interface ChatConversation {
  id: number;
  title: string;
  created_at: string;
  note_id: number;
  filename: string;
  messages: ChatMessage[];
}

interface Note {
  id: number;
  file_id: number;
  note_type: string;
  content: string;
  version: number;
  prompt_used: string;
  ai_model: string;
  quality_score: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface File {
  id: number;
  filename: string;
  original_name: string;
  file_size: number;
  file_type: string;
  transcription: string;
  status: string;
  created_at: string;
}

interface ManagementPageProps {
  user: User;
  onBackToMain: () => void;
  onLogout: () => void;
}

const ManagementPage: React.FC<ManagementPageProps> = ({
  user,
  onBackToMain,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<"chat" | "notes" | "files">(
    "chat"
  );
  const [chatConversations, setChatConversations] = useState<
    ChatConversation[]
  >([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversation, setSelectedConversation] =
    useState<ChatConversation | null>(null);
  const [showChatModal, setShowChatModal] = useState(false);

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("userToken"); // Fixed: was "token", should be "userToken"
      console.log("🔍 Loading data for tab:", activeTab);
      console.log("🔍 User ID:", user.id);
      console.log("🔍 Token:", token ? "Present" : "Missing");

      switch (activeTab) {
        case "chat":
          console.log("🔍 Fetching chat history...");
          const chatResponse = await fetch(
            `${API_BASE_URL}/api/chat/history/${user.id}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          console.log("🔍 Chat response status:", chatResponse.status);
          if (chatResponse.ok) {
            const chatData = await chatResponse.json();
            console.log("🔍 Chat data received:", chatData);
            setChatConversations(chatData.conversations || []);
          } else {
            const errorText = await chatResponse.text();
            console.error("❌ Chat history error:", errorText);
          }
          break;

        case "notes":
          console.log("🔍 Fetching notes...");
          const notesResponse = await fetch(
            `${API_BASE_URL}/api/notes/user/${user.id}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          console.log("🔍 Notes response status:", notesResponse.status);
          if (notesResponse.ok) {
            const notesData = await notesResponse.json();
            console.log("🔍 Notes data received:", notesData);
            setNotes(notesData.notes || []);
          } else {
            const errorText = await notesResponse.text();
            console.error("❌ Notes error:", errorText);
          }
          break;

        case "files":
          console.log("🔍 Fetching files...");
          const filesResponse = await fetch(
            `${API_BASE_URL}/api/files/user/${user.id}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          console.log("🔍 Files response status:", filesResponse.status);
          if (filesResponse.ok) {
            const filesData = await filesResponse.json();
            console.log("🔍 Files data received:", filesData);
            setFiles(filesData.files || []);
          } else {
            const errorText = await filesResponse.text();
            console.error("❌ Files error:", errorText);
          }
          break;
      }
    } catch (error) {
      console.error("❌ Load data error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredConversations = chatConversations.filter(
    (conv) =>
      conv.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredNotes = notes.filter(
    (note) =>
      note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.prompt_used.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFiles = files.filter(
    (file) =>
      file.original_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (file.transcription &&
        file.transcription.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatDate = (dateString: string) => {
    return (
      new Date(dateString).toLocaleDateString() +
      " " +
      new Date(dateString).toLocaleTimeString()
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const downloadTranscription = (transcription: string, filename: string) => {
    const blob = new Blob([transcription], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_transcription.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const viewChatHistory = (conversation: ChatConversation) => {
    setSelectedConversation(conversation);
    setShowChatModal(true);
  };

  const deleteConversation = async (conversationId: number) => {
    if (!window.confirm("Are you sure you want to delete this conversation?")) {
      return;
    }

    try {
      const token = localStorage.getItem("userToken");
      const response = await fetch(
        `${API_BASE_URL}/api/chat/conversation/${conversationId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        console.log(`Conversation ${conversationId} deleted`);
        // Reload data
        loadData();
      } else {
        throw new Error("Failed to delete conversation");
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      alert("Failed to delete conversation. Please try again.");
    }
  };

  const deleteNote = async (noteId: number) => {
    if (!window.confirm("Are you sure you want to delete this note?")) {
      return;
    }

    try {
      const token = localStorage.getItem("userToken");
      const response = await fetch(
        `${API_BASE_URL}/api/notes/${noteId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        console.log(`Note ${noteId} deleted`);
        // Reload data
        loadData();
      } else {
        throw new Error("Failed to delete note");
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
      alert("Failed to delete note. Please try again.");
    }
  };

  const deleteFile = async (fileId: number) => {
    if (!window.confirm("Are you sure you want to delete this file?")) {
      return;
    }

    try {
      const token = localStorage.getItem("userToken");
      const response = await fetch(
        `${API_BASE_URL}/api/files/${fileId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        console.log(`File ${fileId} deleted`);
        // Reload data
        loadData();
      } else {
        throw new Error("Failed to delete file");
      }
    } catch (error) {
      console.error("Failed to delete file:", error);
      alert("Failed to delete file. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBackToMain}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              Management Center
            </h1>
            <span className="text-sm text-gray-500">Welcome, {user.name}</span>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab("chat")}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "chat"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <MessageSquare className="w-4 h-4 inline mr-2" />
            Chat History
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "notes"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Notes & Reports
          </button>
          <button
            onClick={() => setActiveTab("files")}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "files"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Mic className="w-4 h-4 inline mr-2" />
            Files & Transcriptions
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white px-6 py-4 border-b">
        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        ) : (
          <>
            {/* Chat History Tab */}
            {activeTab === "chat" && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Chat Conversations
                </h2>
                {filteredConversations.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No chat conversations yet</p>
                    <p className="text-sm">
                      Start chatting with AI to see your conversation history
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredConversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className="bg-white rounded-lg shadow-sm border p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">
                              {conversation.title}
                            </h3>
                            <p className="text-sm text-gray-600">
                              File: {conversation.filename}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center mt-1">
                              <Clock className="w-3 h-3 mr-1" />
                              {formatDate(conversation.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => viewChatHistory(conversation)}
                              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                            >
                              <Eye className="w-3 h-3 inline mr-1" />
                              View
                            </button>
                            <button
                              onClick={() => deleteConversation(conversation.id)}
                              className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                            >
                              <Trash2 className="w-3 h-3 inline mr-1" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notes Tab */}
            {activeTab === "notes" && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Generated Notes
                </h2>
                {filteredNotes.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No notes generated yet</p>
                    <p className="text-sm">
                      Upload files to generate AI-powered medical notes
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredNotes.map((note) => (
                      <div
                        key={note.id}
                        className="bg-white rounded-lg shadow-sm border p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-gray-900">
                            {note.note_type} - v{note.version}
                          </h3>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              note.status === "generated"
                                ? "bg-green-100 text-green-800"
                                : note.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {note.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {note.content.substring(0, 200)}...
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-500">
                            <span>
                              Prompt: {note.prompt_used.substring(0, 50)}...
                            </span>
                            <span className="ml-4">Created: {formatDate(note.created_at)}</span>
                          </div>
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                          >
                            <Trash2 className="w-3 h-3 inline mr-1" />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Files Tab */}
            {activeTab === "files" && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Uploaded Files
                </h2>
                {filteredFiles.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Mic className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No files uploaded yet</p>
                    <p className="text-sm">
                      Upload audio or text files to get started
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredFiles.map((file) => (
                      <div
                        key={file.id}
                        className="bg-white rounded-lg shadow-sm border p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">
                              {file.original_name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              Size: {formatFileSize(file.file_size)} | Type:{" "}
                              {file.file_type}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center mt-1">
                              <Calendar className="w-3 h-3 mr-1" />
                              {formatDate(file.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            {file.transcription && (
                              <button
                                onClick={() =>
                                  downloadTranscription(
                                    file.transcription,
                                    file.original_name
                                  )
                                }
                                className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                              >
                                <Download className="w-3 h-3 inline mr-1" />
                                Download
                              </button>
                            )}
                            <button
                              onClick={() => deleteFile(file.id)}
                              className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                            >
                              <Trash2 className="w-3 h-3 inline mr-1" />
                              Delete
                            </button>
                          </div>
                        </div>
                        {file.transcription && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-md">
                            <p className="text-xs text-gray-600 mb-1">
                              Transcription Preview:
                            </p>
                            <p className="text-sm text-gray-700">
                              {file.transcription.substring(0, 150)}...
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Chat History Modal */}
      {showChatModal && selectedConversation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  Chat History
                </h2>
                <p className="text-sm text-gray-600">
                  {selectedConversation.title}
                </p>
              </div>
              <button
                onClick={() => setShowChatModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              {selectedConversation.messages.map((message, index) => (
                <div key={index} className="space-y-2">
                  {message.message_text && (
                    <div className="flex justify-end">
                      <div className="bg-blue-600 text-white px-4 py-2 rounded-lg max-w-xs lg:max-w-md">
                        <p className="text-sm">{message.message_text}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {formatDate(message.created_at)}
                        </p>
                      </div>
                    </div>
                  )}
                  {message.ai_response && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg max-w-xs lg:max-w-md">
                        <p className="text-sm">{message.ai_response}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {formatDate(message.created_at)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagementPage;
