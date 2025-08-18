import React, { useState, useEffect } from "react";
import {
  History,
  Play,
  Trash2,
  Save,
  Clock,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ChatHistoryPoint {
  id: string;
  name: string;
  timestamp: Date;
  messageCount: number;
  hasNotes: boolean;
  conversationId: string;
}

interface ChatHistoryManagerProps {
  userId: number;
  onContinueFromHistory: (conversationId: string, messages: any[]) => void;
  onSaveHistoryPoint: (name: string, messages: any[]) => void;
  onDeleteHistoryPoint: (pointId: string) => void;
  currentConversationId?: string;
}

const ChatHistoryManager: React.FC<ChatHistoryManagerProps> = ({
  userId,
  onContinueFromHistory,
  onSaveHistoryPoint,
  onDeleteHistoryPoint,
  currentConversationId,
}) => {
  const [historyPoints, setHistoryPoints] = useState<ChatHistoryPoint[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savePointName, setSavePointName] = useState("");

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  // Load chat history points
  useEffect(() => {
    if (isExpanded) {
      loadHistoryPoints();
    }
  }, [isExpanded]);

  const loadHistoryPoints = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/chat/history/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const points = data.conversations.map((conv: any) => ({
          id: conv.id,
          name: conv.title || `Chat ${conv.id}`,
          timestamp: new Date(conv.created_at),
          messageCount: conv.messages?.length || 0,
          hasNotes: conv.note_id !== null,
          conversationId: conv.id,
        }));
        setHistoryPoints(points);
      }
    } catch (error) {
      console.error("Failed to load history points:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueFromHistory = async (point: ChatHistoryPoint) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/chat/note/${point.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        onContinueFromHistory(point.conversationId, data.messages || []);
        setIsExpanded(false);
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const handleSaveCurrentPoint = () => {
    if (savePointName.trim()) {
      // This would need to be implemented in the parent component
      // to get current messages and save them
      onSaveHistoryPoint(savePointName.trim(), []);
      setShowSaveDialog(false);
      setSavePointName("");
    }
  };

  const handleDeletePoint = async (pointId: string) => {
    if (window.confirm("Are you sure you want to delete this history point?")) {
      onDeleteHistoryPoint(pointId);
      setHistoryPoints((prev) => prev.filter((p) => p.id !== pointId));
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors"
        >
          <History className="w-4 h-4" />
          <span className="font-medium">Chat History</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {isExpanded && (
          <button
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center space-x-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
          >
            <Save className="w-3 h-3" />
            <span>Save Current</span>
          </button>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          {isLoading ? (
            <div className="text-center text-gray-500 py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm">Loading history...</p>
            </div>
          ) : historyPoints.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              <History className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No chat history yet</p>
              <p className="text-xs">Your conversations will appear here</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {historyPoints.map((point) => (
                <div
                  key={point.id}
                  className={`flex items-center justify-between p-2 rounded-lg border ${
                    point.conversationId === currentConversationId
                      ? "border-blue-300 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-sm truncate">
                        {point.name}
                      </span>
                      {point.hasNotes && (
                        <FileText className="w-3 h-3 text-blue-600" />
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatTimestamp(point.timestamp)}
                      </span>
                      <span className="flex items-center">
                        <MessageSquare className="w-3 h-3 mr-1" />
                        {point.messageCount} messages
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleContinueFromHistory(point)}
                      className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                      title="Continue from this point"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePoint(point.id)}
                      className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      title="Delete history point"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save Current Point Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Save Current Chat Point
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Point Name
                </label>
                <input
                  type="text"
                  value={savePointName}
                  onChange={(e) => setSavePointName(e.target.value)}
                  placeholder="Enter a name for this chat point"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCurrentPoint}
                  disabled={!savePointName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatHistoryManager;
