import React, { useState, useEffect } from 'react';

interface AdminDashboardProps {
  API_BASE_URL: string;
}

interface SystemStats {
  files: {
    total_files: number;
    processed_files: number;
    failed_files: number;
    pending_files: number;
    total_size_bytes: number;
  };
  notes: {
    total_notes: number;
    soap_notes: number;
    summary_notes: number;
    general_notes: number;
  };
  users: {
    total_users: number;
    admin_users: number;
    regular_users: number;
  };
  tasks: {
    total_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    pending_tasks: number;
  };
  timestamp: string;
}

interface AdminNote {
  id: number;
  type: string;
  content: any;
  status: string;
  createdAt: string;
  retentionDate: string;
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

const AdminDashboard: React.FC<AdminDashboardProps> = ({ API_BASE_URL }) => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'files' | 'users'>('overview');

  useEffect(() => {
    fetchSystemStats();
    fetchAdminNotes();
  }, []);

  const fetchSystemStats = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        console.error('Failed to fetch system stats:', response.status);
      }
    } catch (err) {
      console.error('Error fetching system stats:', err);
    }
  };

  const fetchAdminNotes = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE_URL}/api/admin/notes`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(data.notes || []);
        setLoading(false);
      } else {
        setError(`Failed to fetch notes: ${response.status}`);
        setLoading(false);
      }
    } catch (err) {
      setError('Failed to fetch notes');
      setLoading(false);
    }
  };

  const downloadAllNotes = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE_URL}/api/admin/download-all`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin_notes_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Error downloading notes:', err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="text-red-600">❌ {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">System overview and management</p>
          </div>
          <button
            onClick={downloadAllNotes}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            📥 Download All Notes
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview', icon: '📊' },
              { id: 'notes', label: 'Notes', icon: '📝' },
              { id: 'files', label: 'Files', icon: '📁' },
              { id: 'users', label: 'Users', icon: '👥' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Files Stats */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <span className="text-2xl">📁</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-blue-600">Total Files</p>
                    <p className="text-2xl font-bold text-blue-900">{stats.files.total_files}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Processed:</span>
                    <span className="font-medium text-green-600">{stats.files.processed_files}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pending:</span>
                    <span className="font-medium text-yellow-600">{stats.files.pending_files}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Failed:</span>
                    <span className="font-medium text-red-600">{stats.files.failed_files}</span>
                  </div>
                </div>
              </div>

              {/* Notes Stats */}
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <span className="text-2xl">📝</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-green-600">Total Notes</p>
                    <p className="text-2xl font-bold text-green-900">{stats.notes.total_notes}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">SOAP Notes:</span>
                    <span className="font-medium">{stats.notes.soap_notes}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Summaries:</span>
                    <span className="font-medium">{stats.notes.summary_notes}</span>
                  </div>
                </div>
              </div>

              {/* Users Stats */}
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <span className="text-2xl">👥</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-purple-600">Total Users</p>
                    <p className="text-2xl font-bold text-purple-900">{stats.users.total_users}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Admins:</span>
                    <span className="font-medium">{stats.users.admin_users}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Regular:</span>
                    <span className="font-medium">{stats.users.regular_users}</span>
                  </div>
                </div>
              </div>

              {/* Tasks Stats */}
              <div className="bg-orange-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <span className="text-2xl">⚙️</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-orange-600">Total Tasks</p>
                    <p className="text-2xl font-bold text-orange-900">{stats.tasks.total_tasks}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Completed:</span>
                    <span className="font-medium text-green-600">{stats.tasks.completed_tasks}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pending:</span>
                    <span className="font-medium text-yellow-600">{stats.tasks.pending_tasks}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">All Notes ({notes.length})</h3>
                <button
                  onClick={fetchAdminNotes}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  🔄 Refresh
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                        File Info
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                        Notes Content
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {notes.map((note) => (
                      <tr key={note.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
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
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            {note.content.soapNote && (
                              <div>
                                <span className="text-xs font-medium text-blue-600">SOAP Note:</span>
                                <div className="text-xs text-gray-700 max-h-20 overflow-y-auto">
                                  {note.content.soapNote.substring(0, 200)}...
                                </div>
                              </div>
                            )}
                            {note.content.patientSummary && (
                              <div>
                                <span className="text-xs font-medium text-green-600">Summary:</span>
                                <div className="text-xs text-gray-700 max-h-20 overflow-y-auto">
                                  {note.content.patientSummary.substring(0, 200)}...
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
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
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {note.user.email}
                          </div>
                          <div className="text-xs text-gray-500">
                            ID: {note.user.id}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(note.createdAt).toLocaleDateString()}
                          <br />
                          <span className="text-xs">
                            {new Date(note.createdAt).toLocaleTimeString()}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => {
                              console.log("Full notes for file:", note.content);
                            }}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                          >
                            View
                          </button>
                          <button
                            onClick={() => {
                              console.log("Download notes for file:", note.id);
                            }}
                            className="text-green-600 hover:text-green-900"
                          >
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl">📁</span>
              <p className="mt-2">Files management coming soon...</p>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl">👥</span>
              <p className="mt-2">User management coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard; 