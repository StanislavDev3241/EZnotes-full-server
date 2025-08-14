import React, { useState, useEffect } from "react";

interface AdminPageProps {
  API_BASE_URL: string;
  onBackToMain: () => void;
  onLogout: () => void;
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
    createdAt: string;
  };
}

const AdminPage: React.FC<AdminPageProps> = ({
  API_BASE_URL,
  onBackToMain,
  onLogout,
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
        if (data.stats && typeof data.stats === "object") {
          setStats(data.stats);
        } else if (typeof data === "object" && data.totalFiles !== undefined) {
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

      content += `\n---\nFile: ${note.file.originalName}\nGenerated: ${new Date(note.createdAt).toLocaleString()}`;

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

  const downloadSoapNote = (note: AdminNote) => {
    try {
      if (!note.content.soapNote) {
        alert("No SOAP note available for this file.");
        return;
      }

      let content = `=== SOAP NOTE ===\n\n${note.content.soapNote}\n\n`;
      content += `\n---\nFile: ${note.file.originalName}\nGenerated: ${new Date(note.createdAt).toLocaleString()}`;

      const blob = new Blob([content], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${note.file.originalName.replace(
        /\.[^/.]+$/,
        ""
      )}_soap_note.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error downloading SOAP note:", err);
    }
  };

  const downloadPatientSummary = (note: AdminNote) => {
    try {
      if (!note.content.patientSummary) {
        alert("No patient summary available for this file.");
        return;
      }

      let content = `=== PATIENT SUMMARY ===\n\n${note.content.patientSummary}\n\n`;
      content += `\n---\nFile: ${note.file.originalName}\nGenerated: ${new Date(note.createdAt).toLocaleString()}`;

      const blob = new Blob([content], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${note.file.originalName.replace(
        /\.[^/.]+$/,
        ""
      )}_patient_summary.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error downloading patient summary:", err);
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
                onClick={onLogout}
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
                  <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    File Info
                  </th>
                  <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes Content
                  </th>
                  <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {notes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-6 py-4 whitespace-nowrap">
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
                    <td className="px-2 sm:px-6 py-4">
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
                    <td className="px-2 sm:px-6 py-4 whitespace-nowrap">
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
                    <td className="px-2 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="text-xs sm:text-sm">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs">
                        {new Date(note.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-2 sm:px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex flex-col gap-2 min-w-[140px]">
                        <button
                          onClick={() => viewNoteDetails(note)}
                          className="text-blue-600 hover:text-blue-900 text-xs px-3 py-2 rounded border border-blue-200 hover:border-blue-300 transition-colors font-medium"
                        >
                          👁️ View
                        </button>
                        {note.content.soapNote && (
                          <button
                            onClick={() => downloadSoapNote(note)}
                            className="text-purple-600 hover:text-purple-900 text-xs px-3 py-2 rounded border border-purple-200 hover:border-purple-300 transition-colors font-medium"
                          >
                            📝 SOAP Note
                          </button>
                        )}
                        {note.content.patientSummary && (
                          <button
                            onClick={() => downloadPatientSummary(note)}
                            className="text-green-600 hover:text-green-900 text-xs px-3 py-2 rounded border border-green-200 hover:border-green-300 transition-colors font-medium"
                          >
                            📋 Summary
                          </button>
                        )}
                        <button
                          onClick={() => downloadNote(note)}
                          className="text-orange-600 hover:text-orange-900 text-xs px-3 py-2 rounded border border-orange-200 hover:border-orange-300 transition-colors font-medium"
                        >
                          📥 All Notes
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
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] lg:max-w-[90vw] xl:max-w-[85vw] h-[90vh] lg:h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white p-4 sm:p-6 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-bold">
                    Note Details
                  </h3>
                  <p className="text-blue-100 text-sm mt-1">
                    {selectedNote.file.originalName}
                  </p>
                </div>
                <button
                  onClick={() => setShowNoteDetails(false)}
                  className="text-white hover:text-blue-100 text-2xl sm:text-3xl font-bold p-2 hover:bg-blue-600 rounded-full transition-all duration-200 hover:scale-110"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
                {/* File Information */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                  <h4 className="font-bold text-gray-800 mb-4 text-base sm:text-lg flex items-center">
                    <span className="text-blue-600 mr-2">📁</span>
                    File Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <span className="font-medium text-gray-600 block mb-1">
                        Name:
                      </span>
                      <span className="text-gray-800 break-all text-xs sm:text-sm">
                        {selectedNote.file.originalName}
                      </span>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <span className="font-medium text-gray-600 block mb-1">
                        Size:
                      </span>
                      <span className="text-gray-800 text-xs sm:text-sm">
                        {formatFileSize(selectedNote.file.fileSize)}
                      </span>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <span className="font-medium text-gray-600 block mb-1">
                        Type:
                      </span>
                      <span className="text-gray-800 text-xs sm:text-sm">
                        {selectedNote.file.fileType}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SOAP Note */}
                {selectedNote.content.soapNote && (
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-4 sm:p-6 border border-blue-200 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-blue-800 text-base sm:text-lg flex items-center">
                        <span className="text-blue-600 mr-2">🎯</span>
                        SOAP Note
                      </h4>
                      <button
                        onClick={() => downloadSoapNote(selectedNote)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center"
                      >
                        📥 Download SOAP
                      </button>
                    </div>
                    <div className="bg-white rounded-xl p-4 sm:p-6 border border-blue-200 shadow-sm">
                      <div className="text-sm sm:text-base text-gray-800 whitespace-pre-wrap font-sans leading-relaxed max-h-[40vh] overflow-y-auto">
                        {selectedNote.content.soapNote}
                      </div>
                    </div>
                  </div>
                )}

                {/* Patient Summary */}
                {selectedNote.content.patientSummary && (
                  <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-4 sm:p-6 border border-green-200 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-green-800 text-base sm:text-lg flex items-center">
                        <span className="text-green-600 mr-2">📋</span>
                        Patient Summary
                      </h4>
                      <button
                        onClick={() => downloadPatientSummary(selectedNote)}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center"
                      >
                        📥 Download Summary
                      </button>
                    </div>
                    <div className="bg-white rounded-xl p-4 sm:p-6 border border-green-200 shadow-sm">
                      <div className="text-sm sm:text-base text-gray-800 whitespace-pre-wrap font-sans leading-relaxed max-h-[40vh] overflow-y-auto">
                        {selectedNote.content.patientSummary}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 p-4 sm:p-6 flex-shrink-0">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-sm text-gray-600">
                  Generated: {new Date(selectedNote.createdAt).toLocaleString()}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => downloadNote(selectedNote)}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all duration-200 font-medium text-sm sm:text-base shadow-lg hover:shadow-xl"
                  >
                    📥 Download All Notes
                  </button>
                  <button
                    onClick={() => setShowNoteDetails(false)}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-200 font-medium text-sm sm:text-base shadow-lg hover:shadow-xl"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
