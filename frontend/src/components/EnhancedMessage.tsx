import React, { useState } from "react";
import {
  Edit3,
  Copy,
  Save,
  Download,
  Trash2,
  Check,
  X,
  MessageSquare,
  FileText,
} from "lucide-react";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  noteContext?: any;
}

interface EnhancedMessageProps {
  message: Message;
  isOwnMessage: boolean;
  onEditMessage: (messageId: string, newText: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onSaveNote: (content: string, noteType: string) => void;
  onDownloadNote: (content: string, filename: string) => void;
}

const EnhancedMessage: React.FC<EnhancedMessageProps> = ({
  message,
  isOwnMessage,
  onEditMessage,
  onDeleteMessage,
  onSaveNote,
  onDownloadNote,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleEdit = () => {
    setIsEditing(true);
    setEditText(message.text);
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText !== message.text) {
      onEditMessage(message.id, editText.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(message.text);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleSaveNote = () => {
    const noteType = message.noteContext ? "custom_note" : "chat_response";
    const content = message.text;
    onSaveNote(content, noteType);
  };

  const handleDownloadNote = () => {
    const filename = `note_${message.id}_${new Date().toISOString().split('T')[0]}.txt`;
    onDownloadNote(message.text, filename);
  };

  const isAIMessage = message.sender === "ai";
  const hasNoteContext = message.noteContext && Object.keys(message.noteContext).length > 0;

  if (isEditing) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-xs lg:max-w-md bg-blue-100 border border-blue-300 rounded-lg p-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full resize-none border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end space-x-2 mt-2">
            <button
              onClick={handleSaveEdit}
              className="flex items-center px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
            >
              <Check className="w-3 h-3 mr-1" />
              Save
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex items-center px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} mb-4 group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        className={`relative max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
          isOwnMessage
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-800"
        }`}
      >
        {/* Message Content */}
        <p className="whitespace-pre-wrap text-sm lg:text-base">{message.text}</p>
        
        {/* Timestamp */}
        <p className={`text-xs mt-1 ${
          isOwnMessage ? "opacity-70" : "text-gray-500"
        }`}>
          {message.timestamp.toLocaleTimeString()}
        </p>

        {/* Action Buttons - Show on hover */}
        {showActions && (
          <div className={`absolute top-0 ${
            isOwnMessage ? "-left-20" : "-right-20"
          } flex space-x-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1`}>
            
            {/* Copy Button - Available for all messages */}
            <button
              onClick={handleCopy}
              className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Copy message"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>

            {/* Edit Button - Only for user's own messages */}
            {isOwnMessage && (
              <button
                onClick={handleEdit}
                className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title="Edit message"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}

            {/* Delete Button - Only for user's own messages */}
            {isOwnMessage && (
              <button
                onClick={() => onDeleteMessage(message.id)}
                className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Delete message"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Save Note Button - Only for AI messages */}
            {isAIMessage && (
              <button
                onClick={handleSaveNote}
                className="p-1 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                title="Save as note"
              >
                <Save className="w-4 h-4" />
              </button>
            )}

            {/* Download Button - Only for AI messages */}
            {isAIMessage && (
              <button
                onClick={handleDownloadNote}
                className="p-1 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                title="Download note"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Note Context Indicator - Show if message has note context */}
        {hasNoteContext && (
          <div className={`mt-2 p-2 rounded text-xs ${
            isOwnMessage 
              ? "bg-blue-500 text-white" 
              : "bg-gray-200 text-gray-700"
          }`}>
            <div className="flex items-center">
              <FileText className="w-3 h-3 mr-1" />
              <span>Contains note context</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedMessage; 