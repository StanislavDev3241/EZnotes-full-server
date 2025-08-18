import React, { useState, useEffect } from "react";
import { FileText, Download, Trash2, Eye, FileAudio, File } from "lucide-react";

interface UploadedFile {
  id: number;
  filename: string;
  original_name: string;
  file_size: number;
  file_type: string;
  status: string;
  transcription?: string;
  created_at: string;
  user_id: number;
}

interface FileManagementProps {
  userId: number;
  onSelectFile: (file: UploadedFile) => void;
  onLoadFileNotes: (fileId: number) => void;
}

const FileManagement: React.FC<FileManagementProps> = ({
  userId,
  onSelectFile,
  onLoadFileNotes,
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  // Load uploaded files
  useEffect(() => {
    loadUploadedFiles();
  }, [userId]);

  const loadUploadedFiles = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/files/user/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setUploadedFiles(data.files || []);
      }
    } catch (error) {
      console.error("Failed to load uploaded files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (window.confirm("Are you sure you want to delete this file? This will also delete associated notes and conversations.")) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/files/${fileId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("userToken")}`,
            },
          }
        );

        if (response.ok) {
          setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
          if (selectedFile?.id === fileId) {
            setSelectedFile(null);
          }
        }
      } catch (error) {
        console.error("Failed to delete file:", error);
      }
    }
  };

  const handleDownloadFile = async (file: UploadedFile) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/files/${file.id}/download`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.original_name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Failed to download file:", error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('audio/')) {
      return <FileAudio className="w-5 h-5 text-blue-600" />;
    } else if (fileType === 'text/plain') {
      return <FileText className="w-5 h-5 text-green-600" />;
    } else {
      return <File className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      uploaded: 'bg-gray-100 text-gray-800',
      processed: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-500">Loading uploaded files...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Uploaded Files</h3>
        <button
          onClick={loadUploadedFiles}
          className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
        >
          <FileText className="w-4 h-4 mr-1" />
          Refresh
        </button>
      </div>

      {uploadedFiles.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <File className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No uploaded files yet</p>
          <p className="text-xs">Your uploaded files will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className={`bg-white p-4 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md ${
                selectedFile?.id === file.id
                  ? "border-blue-300 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setSelectedFile(file)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1 min-w-0">
                  {getFileIcon(file.file_type)}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="font-medium text-gray-900 truncate">
                        {file.original_name}
                      </h4>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(file.status)}`}>
                        {file.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>Size: {formatFileSize(file.file_size)}</span>
                      <span>Type: {file.file_type}</span>
                      <span>Uploaded: {formatDate(file.created_at)}</span>
                      {file.transcription && (
                        <span className="text-green-600">✓ Transcribed</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1 ml-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFile(file);
                    }}
                    className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Select file"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onLoadFileNotes(file.id);
                    }}
                    className="p-1 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                    title="Load file notes"
                  >
                    <FileText className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadFile(file);
                    }}
                    className="p-1 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                    title="Download file"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.id);
                    }}
                    className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileManagement; 