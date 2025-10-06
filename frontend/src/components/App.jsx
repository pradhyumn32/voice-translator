// frontend/src/App.jsx
import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import './../App.css';

const App = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Ready to translate');
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [sourceLang, setSourceLang] = useState('auto'); // Default to auto-detect
  const [targetLang, setTargetLang] = useState('es'); // Default: Spanish
  
  const mediaRecorder = useRef(null);
  const socket = useRef(null);
  const audioChunks = useRef([]);

  // Available languages - you can expand this list
  const languages = [
    { code: 'auto', name: 'Auto-Detect' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh', name: 'Chinese' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ar', name: 'Arabic' },
    { code: 'ko', name: 'Korean' }
  ];

  useEffect(() => {
    // Connect to backend
    socket.current = io('https://voice-translator-1xk5.onrender.com');
    
    socket.current.on('connect', () => {
      console.log('✅ Connected to server');
      setIsConnected(true);
      setStatus('Ready to translate');
    });
    
    socket.current.on('connected', (data) => {
      console.log('Server connection confirmed:', data);
      setDebugInfo(`Connected: ${data.socketId}`);
    });
    
    socket.current.on('translated-audio', ({ audio, text }) => {
      console.log('✅ Received translated audio + text');
      playTranslatedAudio(audio, text);
      setStatus('Translation complete!');
      setIsRecording(false);
    });
    
    socket.current.on('status-update', (newStatus) => {
      console.log('Status update:', newStatus);
      setStatus(newStatus);
    });
    
    socket.current.on('error', (errorMsg) => {
      console.error('Server error:', errorMsg);
      setError(errorMsg);
      setStatus('Error occurred');
      setIsRecording(false);
    });
    
    socket.current.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      setIsConnected(false);
      setStatus('Disconnected from server');
    });
    
    return () => {
      if (socket.current) {
        socket.current.disconnect();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError('');
      setStatus('Requesting microphone access...');
      setDebugInfo('Initializing recording...');
      
      // Check microphone permissions
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this browser');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true
        } 
      });
      
      console.log('✅ Microphone access granted');
      setDebugInfo('Microphone active');
      
      audioChunks.current = [];
      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };
      
      mediaRecorder.current.onstop = () => {
        console.log('⏹️ Recording stopped, processing data...');
        stream.getTracks().forEach(track => track.stop());

        // Combine chunks and send inside onstop
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm;codecs=opus' });
        
        if (audioBlob.size === 0) {
          console.warn('🎤 No audio data captured. Not sending to server.');
          setStatus('No audio detected. Please try again.');
          return;
        }
        
        console.log('📨 Sending complete audio, size:', audioBlob.size);
        setDebugInfo(`Sending audio: ${audioBlob.size} bytes`);

        socket.current.emit('audio-stream', {
          audio: audioBlob,
          sourceLang: sourceLang,
          targetLang: targetLang
        });
      };
      
      mediaRecorder.current.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording error: ' + event.error);
      };
      
      // Start recording
      mediaRecorder.current.start();
      setIsRecording(true);
      setStatus(`Speak now (${getLanguageName(sourceLang)} → ${getLanguageName(targetLang)})...`);
      setDebugInfo('Recording active - speak into microphone');
      
    } catch (error) {
      console.error('Recording start error:', error);
      setError(`Recording failed: ${error.message}`);
      setStatus('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      console.log('🛑 Stopping recording...');
      mediaRecorder.current.stop();
      setIsRecording(false);
      audioChunks.current = []; // Clear chunks for next recording
      setStatus('Processing...');
      setDebugInfo('Processing audio...');
    }
  };

  const playTranslatedAudio = (audioData, textFallback = '') => {
    try {
      console.log('🔊 Playing translated audio...');

      // Handle case where backend sent invalid or mock audio
      if (!audioData || (audioData.byteLength !== undefined && audioData.byteLength < 50)) {
        console.warn("⚠️ No valid audio received, falling back to browser TTS");
        if (textFallback) {
          browserTextToSpeech(textFallback, targetLang);
        } else {
          setError("No valid audio received");
        }
        return;
      }

      // Convert buffer to Uint8Array
      const uint8Array = new Uint8Array(audioData);

      // Most TTS APIs (if working) return MP3 or WAV
      const audioBlob = new Blob([uint8Array], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        console.log('Audio playback finished');
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        console.warn("⚠️ Falling back to browser TTS");
        if (textFallback) browserTextToSpeech(textFallback, targetLang);
      };

      audio.play()
        .then(() => console.log('✅ Audio playback started'))
        .catch(e => {
          console.error('Audio play failed:', e);
          console.warn("⚠️ Falling back to browser TTS");
          if (textFallback) browserTextToSpeech(textFallback, targetLang);
        });

    } catch (error) {
      console.error('Audio play error:', error);
      console.warn("⚠️ Falling back to browser TTS");
      if (textFallback) browserTextToSpeech(textFallback, targetLang);
    }
  };

  const testConnection = async () => {
    try {
      setStatus('Testing connection...');
      const response = await fetch('https://voice-translator-1xk5.onrender.com/api/health');
      const data = await response.json();
      setDebugInfo(`Server: ${data.status}, HF: ${data.services.huggingFace}`);
      setStatus('Connection test complete');
    } catch (error) {
      setError('Connection test failed: ' + error.message);
    }
  };

  const browserTextToSpeech = (text, lang = "es-ES") => {
    // Map our language codes to browser TTS language codes
    const langMap = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-PT',
      'ru': 'ru-RU',
      'ja': 'ja-JP',
      'zh': 'zh-CN',
      'hi': 'hi-IN',
      'ar': 'ar-SA',
      'ko': 'ko-KR'
    };
    
    const ttsLang = langMap[lang] || 'es-ES';
    
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = ttsLang;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
      console.log("🗣️ Browser TTS speaking:", text);
    } else {
      setError("Browser TTS not supported");
    }
  };

  const getLanguageName = (code) => {
    const lang = languages.find(l => l.code === code);
    return lang ? lang.name : code;
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Voice Translator</h1>
        <div className="connection-status">
          Status: <span className={isConnected ? 'connected' : 'disconnected'}>
            {isConnected ? '✅ Connected' : '❌ Disconnected'}
          </span>
        </div>
      </header>
      
      {/* Language Selection */}
      <div className="language-selection">
        <div className="language-group">
          <label htmlFor="source-lang">Source Language:</label>
          <select 
            id="source-lang"
            value={sourceLang} 
            onChange={(e) => setSourceLang(e.target.value)}
            disabled={isRecording}
          >
            {languages.map(lang => (
              <option key={`source-${lang.code}`} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="language-arrow">→</div>
        
        <div className="language-group">
          <label htmlFor="target-lang">Target Language:</label>
          <select 
            id="target-lang"
            value={targetLang} 
            onChange={(e) => setTargetLang(e.target.value)}
            disabled={isRecording}
          >
            {languages.map(lang => (
              <option key={`target-${lang.code}`} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="controls">
        <div className="button-group">
          <button 
            onClick={startRecording} 
            disabled={isRecording || !isConnected}
            className="record-btn start"
          >
            🎤 Start Speaking ({getLanguageName(sourceLang)} → {getLanguageName(targetLang)})
          </button>
          
          <button 
            onClick={stopRecording} 
            disabled={!isRecording}
            className="record-btn stop"
          >
            ⏹️ Stop
          </button>
          
          <button 
            onClick={testConnection}
            className="test-btn"
          >
            🔍 Test Connection
          </button>
        </div>
        
        <div className="status-container">
          <div className={`status ${error ? 'error' : ''}`}>
            {status}
          </div>
          {debugInfo && (
            <div className="debug-info">
              {debugInfo}
            </div>
          )}
        </div>
      </div>
      
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <div className="instructions">
        <h3>Debugging Tips:</h3>
        <ul>
          <li>Check browser console for detailed logs</li>
          <li>Ensure microphone permissions are granted</li>
          <li>Click "Test Connection" to check server status</li>
          <li>Speak clearly into the microphone</li>
          <li>Some language combinations may work better than others</li>
        </ul>
      </div>
    </div>
  );
};

export default App;