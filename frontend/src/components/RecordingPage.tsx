import { useState, useRef, useEffect } from "react";
import { Mic, Play, Pause, Square, Download, Upload, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface RecordingPageProps {
  user: any;
}

const RecordingPage: React.FC<RecordingPageProps> = ({ user }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const microphone = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrame = useRef<number>();
  const recordingInterval = useRef<number>();
  
  const navigate = useNavigate();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  useEffect(() => {
    // Initialize audio context and analyzer for level monitoring
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          audioContext.current = new AudioContext();
          analyser.current = audioContext.current.createAnalyser();
          microphone.current = audioContext.current.createMediaStreamSource(stream);
          
          analyser.current.fftSize = 256;
          const bufferLength = analyser.current.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          
          microphone.current.connect(analyser.current);
          
          const updateAudioLevel = () => {
            if (analyser.current) {
              analyser.current.getByteFrequencyData(dataArray);
              const average = dataArray.reduce((a, b) => a + b) / bufferLength;
              setAudioLevel(average);
            }
            animationFrame.current = requestAnimationFrame(updateAudioLevel);
          };
          
          updateAudioLevel();
        })
        .catch((err) => {
          console.error("Error accessing microphone:", err);
        });
    }

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, []);

  const startRecording = () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          const recorder = new MediaRecorder(stream);
          mediaRecorder.current = recorder;
          audioChunks.current = [];
          
          recorder.ondataavailable = (event) => {
            audioChunks.current.push(event.data);
          };
          
          recorder.onstop = () => {
            const blob = new Blob(audioChunks.current, { type: "audio/wav" });
            setAudioBlob(blob);
            setAudioUrl(URL.createObjectURL(blob));
            setFileName(`recording_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.wav`);
          };
          
          recorder.start();
          setIsRecording(true);
          setRecordingTime(0);
          
          // Start timer
          recordingInterval.current = setInterval(() => {
            setRecordingTime((prev) => prev + 1);
          }, 1000);
        })
        .catch((err) => {
          console.error("Error starting recording:", err);
        });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
      setIsRecording(false);
      
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
      
      // Stop all tracks
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const playRecording = () => {
    if (audioUrl && !isPlaying) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    }
  };

  const pauseRecording = () => {
    // For simplicity, we'll just stop the audio
    setIsPlaying(false);
  };

  const downloadRecording = () => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const uploadRecording = async () => {
    if (!audioBlob) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    formData.append("file", audioBlob, fileName);
    formData.append("userId", user.id);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
        },
        body: formData,
      });
      
      if (response.ok) {
        const result = await response.json();
        alert("Recording uploaded successfully! File ID: " + result.fileId);
        // Navigate to results or chat
        navigate("/chat");
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate("/chat")}
            className="flex items-center text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Chat
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Audio Recording</h1>
          <div className="w-20"></div> {/* Spacer for centering */}
        </div>

        {/* Recording Interface */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              {isRecording ? "Recording..." : "Ready to Record"}
            </h2>
            
            {/* Audio Level Visualization */}
            <div className="w-32 h-32 mx-auto mb-6 relative">
              <div className="w-full h-full rounded-full border-4 border-gray-200 flex items-center justify-center">
                <div
                  className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center transition-all duration-100"
                  style={{
                    transform: `scale(${1 + (audioLevel / 255) * 0.5})`,
                    opacity: isRecording ? 0.8 : 0.3,
                  }}
                >
                  {isRecording ? (
                    <Mic className="h-12 w-12 text-white" />
                  ) : (
                    <Mic className="h-12 w-12 text-white" />
                  )}
                </div>
              </div>
              
              {/* Recording indicator */}
              {isRecording && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full animate-pulse"></div>
              )}
            </div>

            {/* Recording Time */}
            <div className="text-4xl font-mono text-gray-800 mb-6">
              {formatTime(recordingTime)}
            </div>

            {/* Recording Controls */}
            <div className="flex items-center justify-center space-x-4 mb-6">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Mic className="h-5 w-5 mr-2" />
                  Start Recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Square className="h-5 w-5 mr-2" />
                  Stop Recording
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Playback and Actions */}
        {audioBlob && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Recording Actions</h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Playback Controls */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-700">Playback</h4>
                <div className="flex space-x-3">
                  <button
                    onClick={playRecording}
                    disabled={isPlaying}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Play
                  </button>
                  <button
                    onClick={pauseRecording}
                    disabled={!isPlaying}
                    className="flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </button>
                </div>
                <p className="text-sm text-gray-500">File: {fileName}</p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-700">Actions</h4>
                <div className="flex space-x-3">
                  <button
                    onClick={downloadRecording}
                    className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </button>
                  <button
                    onClick={uploadRecording}
                    disabled={isUploading}
                    className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {isUploading ? "Uploading..." : "Upload to AI"}
                  </button>
                </div>
                
                {/* Upload Progress */}
                {isUploading && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingPage; 