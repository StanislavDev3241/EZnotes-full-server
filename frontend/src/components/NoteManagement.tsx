import React, { useState, useEffect } from "react";
import { FileText, Trash2, Eye, Plus } from "lucide-react";

interface SavedNote {
  id: number;
  note_name: string;
  note_type: string;
  created_at: string;
  updated_at: string;
  file_id?: number;
  conversation_id?: number;
}

interface NoteManagementProps {
  userId: number;
  onSelectNote: (note: SavedNote) => void;
  onLoadConversation: (conversationId: number) => void;
}

const NoteManagement: React.FC<NoteManagementProps> = ({
  userId,
  onSelectNote,
  onLoadConversation,
}) => {
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNote, setSelectedNote] = useState<SavedNote | null>(null);
  const [showNoteContent, setShowNoteContent] = useState(false);
  const [noteContent, setNoteContent] = useState("");

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  // Load saved notes
  useEffect(() => {
    loadSavedNotes();
  }, [userId]);

  const loadSavedNotes = async () => {
    setIsLoading(true);
    try {
      console.log("Loading saved notes for user:", userId);
      
      // Load saved notes (which now include generated notes)
      const response = await fetch(
        `${API_BASE_URL}/api/notes/saved/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      console.log("Response status:", response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log("Saved notes data:", data);
        
        const notes = data.notes || [];
        console.log("Notes array:", notes);

        // Sort by creation date (newest first)
        notes.sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        console.log("Sorted notes:", notes);
        setSavedNotes(notes);
      } else {
        console.error("Failed to load saved notes, status:", response.status);
        const errorText = await response.text();
        console.error("Error response:", errorText);
      }
    } catch (error) {
      console.error("Failed to load saved notes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewNote = async (note: SavedNote) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/notes/saved/content/${note.id}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setNoteContent(data.content);
        setSelectedNote(note);
        setShowNoteContent(true);
      }
    } catch (error) {
      console.error("Failed to load note content:", error);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/notes/saved/${noteId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("userToken")}`,
            },
          }
        );

        if (response.ok) {
          setSavedNotes((prev) => prev.filter((note) => note.id !== noteId));
          if (selectedNote?.id === noteId) {
            setSelectedNote(null);
            setShowNoteContent(false);
          }
        }
      } catch (error) {
        console.error("Failed to delete note:", error);
      }
    }
  };

  const handleLoadConversation = (note: SavedNote) => {
    if (note.conversation_id) {
      onLoadConversation(note.conversation_id);
      onSelectNote(note);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getNoteTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      soap_note: "SOAP Note",
      patient_summary: "Patient Summary",
      complete_conversation: "Complete Conversation",
      custom_note: "Custom Note",
      ai_generated: "AI Generated",
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-500">Loading saved notes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Saved Notes</h3>
        <button
          onClick={loadSavedNotes}
          className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
        >
          <Plus className="w-4 h-4 mr-1" />
          Refresh
        </button>
      </div>

      {savedNotes.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No saved notes yet</p>
          <p className="text-xs">Your saved notes will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {savedNotes.map((note) => (
            <div
              key={note.id}
              className={`bg-white p-4 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md ${
                selectedNote?.id === note.id
                  ? "border-blue-300 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setSelectedNote(note)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <h4 className="font-medium text-gray-900 truncate">
                      {note.note_name}
                    </h4>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {getNoteTypeLabel(note.note_type)}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>Created: {formatDate(note.created_at)}</span>
                    {note.updated_at !== note.created_at && (
                      <span>Updated: {formatDate(note.updated_at)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-1 ml-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewNote(note);
                    }}
                    className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="View note content"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {note.conversation_id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadConversation(note);
                      }}
                      className="p-1 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                      title="Load conversation"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNote(note.id);
                    }}
                    className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Note Content Modal */}
      {showNoteContent && selectedNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedNote.note_name}
              </h3>
              <button
                onClick={() => setShowNoteContent(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                {noteContent}
              </pre>
            </div>

            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowNoteContent(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Close
              </button>
              {selectedNote.conversation_id && (
                <button
                  onClick={() => {
                    handleLoadConversation(selectedNote);
                    setShowNoteContent(false);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Load Conversation
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NoteManagement;
