import React, { useState, useEffect } from "react";

interface AdminPageProps {
  API_BASE_URL: string;
  onBackToMain: () => void;
}

interface SystemStats {
  totalFiles: number;
  totalNotes: number;
  totalUsers: number;
  totalTasks: number;
}

interface AdminNote {
  id: number;
  content: {
    soapNote?: string;
    patientSummary?: string;
  };
  status: string;
  createdAt: string;
  file: {
    id: number;
    originalName: string;
    fileSize: number;
    fileType: string;
  };
  user: {
    id: number;
    email: string;
  };
}

const AdminPage: React.FC<AdminPageProps> = ({
  API_BASE_URL,
  onBackToMain,
}) => {
  console.log("🔍 AdminPage component rendering - API_BASE_URL:", API_BASE_URL);

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<AdminNote | null>(null);
  const [showNoteDetails, setShowNoteDetails] = useState(false);

  useEffect(() => {
    console.log("🔍 AdminPage useEffect triggered - fetching data");
    fetchSystemStats();
    fetchAdminNotes();
  }, []);

  const fetchSystemStats = async () => {
    console.log("🔍 fetchSystemStats called");
    try {
      const token = localStorage.getItem("adminToken");
      console.log("🔍 Admin token:", !!token);
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("🔍 Stats data received:", data);
        // Handle both direct object and nested response
        if (data.stats && typeof data.stats === 'object') {
          setStats(data.stats);
        } else if (typeof data === 'object' && data.totalFiles !== undefined) {
          setStats(data);
        } else {
          console.error("🔍 Unexpected stats data structure:", data);
          setStats(null);
        }
      } else {
        console.log("🔍 Stats request failed:", response.status);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  const fetchAdminNotes = async () => {
    console.log("🔍 fetchAdminNotes called");
    try {
      setLoading(true);
      const token = localStorage.getItem("adminToken");
      console.log("🔍 Admin token for notes:", !!token);
      const response = await fetch(`${API_BASE_URL}/api/admin/notes`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("🔍 Notes data received:", data);
        // Handle both direct array and paginated response
        if (data.notes && Array.isArray(data.notes)) {
          setNotes(data.notes);
        } else if (Array.isArray(data)) {
          setNotes(data);
        } else {
          console.error("🔍 Unexpected notes data structure:", data);
          setNotes([]);
        }
      } else {
        console.log("🔍 Notes request failed:", response.status);
        setError("Failed to fetch notes");
      }
    } catch (err) {
      console.error("Error fetching notes:", err);
      setError("Error fetching notes");
    } finally {
      setLoading(false);
    }
  };

  const downloadAllNotes = async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const response = await fetch(`${API_BASE_URL}/api/admin/download-all`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `admin_notes_${
          new Date().toISOString().split("T")[0]
        }.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("Error downloading notes:", err);
    }
  };

  const viewNoteDetails = (note: AdminNote) => {
    setSelectedNote(note);
    setShowNoteDetails(true);
  };

  const downloadNote = (note: AdminNote) => {
    try {
      let content = "";

      if (note.content.soapNote) {
        content += `=== SOAP NOTE ===\n\n${note.content.soapNote}\n\n`;
      }

      if (note.content.patientSummary) {
        content += `=== PATIENT SUMMARY ===\n\n${note.content.patientSummary}\n\n`;
      }

      content += `\n---\nFile: ${note.file.originalName}\nUser: ${
        note.user.email
      }\nGenerated: ${new Date(note.createdAt).toLocaleString()}`;

      const blob = new Blob([content], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${note.file.originalName.replace(
        /\.[^/.]+$/,
        ""
      )}_notes.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error downloading note:", err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  console.log(
    "🔍 AdminPage render - loading:",
    loading,
    "error:",
    error,
    "stats:",
    !!stats,
    "notes count:",
    notes.length
  );

  if (loading) {
    console.log("🔍 AdminPage showing loading state");
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    console.log("🔍 AdminPage showing error state:", error);
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-600">❌ {error}</div>
        </div>
      </div>
    );
  }

  console.log("🔍 AdminPage rendering main content");
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBackToMain}
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                ← Back to Main App
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                Admin Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={downloadAllNotes}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                📥 Download All Notes
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("adminToken");
                  onBackToMain();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                🚪 Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <span className="text-2xl">📁</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Total Files
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalFiles}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <span className="text-2xl">📝</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Total Notes
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalNotes}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <span className="text-2xl">👥</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Total Users
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalUsers}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <span className="text-2xl">⚡</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Total Tasks
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalTasks}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">
                All Notes ({notes.length})
              </h3>
              <button
                onClick={fetchAdminNotes}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    File Info
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes Content
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {notes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900 break-all">
                          {note.file.originalName}
                        </div>
                        <div className="text-xs text-gray-500">
                          Size: {formatFileSize(note.file.fileSize)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Type: {note.file.fileType}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        {note.content.soapNote && (
                          <div>
                            <span className="text-xs font-medium text-blue-600">
                              SOAP Note:
                            </span>
                            <div className="text-xs text-gray-700 max-h-32 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
                              {note.content.soapNote}
                            </div>
                          </div>
                        )}
                        {note.content.patientSummary && (
                          <div>
                            <span className="text-xs font-medium text-green-600">
                              Summary:
                            </span>
                            <div className="text-xs text-gray-700 max-h-32 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
                              {note.content.patientSummary}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          note.status === "generated"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {note.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 break-all">
                        {note.user.email}
                      </div>
                      <div className="text-xs text-gray-500">
                        ID: {note.user.id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="text-xs sm:text-sm">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs">
                        {new Date(note.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                        <button
                          onClick={() => viewNoteDetails(note)}
                          className="text-blue-600 hover:text-blue-900 text-xs sm:text-sm px-2 py-1 rounded border border-blue-200 hover:border-blue-300"
                        >
                          👁️ View
                        </button>
                        <button
                          onClick={() => downloadNote(note)}
                          className="text-green-600 hover:text-green-900 text-xs sm:text-sm px-2 py-1 rounded border border-green-200 hover:border-green-300"
                        >
                          📥 Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Note Details Modal */}
      {showNoteDetails && selectedNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Note Details</h3>
                <button
                  onClick={() => setShowNoteDetails(false)}
                  className="text-white hover:text-blue-100 text-3xl font-bold"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-6">
                {selectedNote.content.soapNote && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h4 className="font-bold text-blue-800 mb-3">SOAP Note</h4>
                    <div className="bg-white rounded-lg p-4 border border-blue-200">
                      <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                        {selectedNote.content.soapNote}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedNote.content.patientSummary && (
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h4 className="font-bold text-green-800 mb-3">
                      Patient Summary
                    </h4>
                    <div className="bg-white rounded-lg p-4 border border-green-200">
                      <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                        {selectedNote.content.patientSummary}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 p-4">
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => downloadNote(selectedNote)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  📥 Download Note
                </button>
                <button
                  onClick={() => setShowNoteDetails(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
