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
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [theme, setTheme] = useState('light');
  
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
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

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
    
    socket.current.on('translated-audio', ({ audio, text, originalText }) => {
      console.log('✅ Received translated audio + text', { originalText, translatedText: text });
      setInputText(originalText || 'Could not transcribe audio.');
      setTranslatedText(text || 'Could not translate text.');
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
      setInputText('');
      setTranslatedText('');
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

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className='bg-background-light dark:bg-background-dark font-display text-gray-800 dark:text-gray-200'>
    <div className="flex flex-col min-h-screen">
      <header className="bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-sm sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800">
       <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
<div className="flex items-center gap-3">
<div className="text-primary">
<svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"></path></svg>
</div>
<h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transly</h1>
</div>
<div className="flex-grow hidden md:flex items-center justify-center gap-8">
<a className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-primary transition-colors" href="#">Features</a>
<a className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-primary transition-colors" href="#">Pricing</a>
<a className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-primary transition-colors" href="#">Support</a>
</div>
<div className="flex items-center gap-4">
<button onClick={toggleTheme} className="flex items-center justify-center p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" id="theme-toggle">
<span className="material-symbols-outlined dark:hidden">light_mode</span>
<span className="material-symbols-outlined hidden dark:inline">dark_mode</span>
</button>
<button className="hidden md:block text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-primary transition-colors">Log In</button>
<button className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                        Get Started
                    </button>
</div>
</nav>
</header>
<main className='flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
<div className="w-full max-w-4xl space-y-8">
<div className="text-center">
<h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">Real-Time Translation</h2>
<p className="mt-4 text-lg text-gray-600 dark:text-gray-400">Speak and watch your words get translated instantly.</p>
</div>
<div className="bg-white dark:bg-card-dark p-6 sm:p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800">
<div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
<div className="space-y-4">
<div className="flex items-center justify-between">
<label className="block text-sm font-medium text-gray-700 dark:text-gray-300" for="from-language">Spoken Language</label>
<select
className="form-select appearance-none block w-1/2 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white" id="from-language" name="from-language"
value={sourceLang} 
            onChange={(e) => setSourceLang(e.target.value)}
            disabled={isRecording}>
{languages.map(lang => (
              <option key={`source-${lang.code}`} value={lang.code}>
                {lang.name}
              </option>
            ))}
</select>
</div>
<div className="relative">
<textarea 
  className="block w-full border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm p-4 pr-12 focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400" 
  id="source-text" 
  name="source-text" 
  placeholder="Your spoken text will appear here..." 
  rows="8"
  value={inputText}
  readOnly></textarea>
<div className="absolute bottom-4 right-4 flex items-center justify-center p-2 rounded-full text-primary bg-primary/10 mic-active">
<button onClick={startRecording} 
  disabled={isRecording || !isConnected}><span className="material-symbols-outlined">mic</span></button>
</div>
</div>
</div>
<div className="relative flex flex-col h-full">
<div className="flex items-center justify-between">
<label className="block text-sm font-medium text-gray-700 dark:text-gray-300" for="to-language">Translated Language</label>
<select
  className="form-select appearance-none block w-1/2 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white" id="to-language" name="to-language"
   value={targetLang} 
    onChange={(e) => setTargetLang(e.target.value)}
    disabled={isRecording}>
   {languages.map(lang => (
              <option key={`target-${lang.code}`} value={lang.code}>
                {lang.name}
              </option>
            ))}
</select>
</div>
<div className="relative flex-grow mt-4">
<div className="h-full w-full border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm p-4 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm" id="translated-text">
{translatedText ? (
  <p>{translatedText}</p>
) : (
  <p className="text-gray-500 dark:text-gray-400">Translated text will appear here...</p>
)}
</div>
<div className="absolute bottom-4 left-4 flex gap-2">
<button aria-label="Listen to translated text" className="flex items-center justify-center p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
<span className="material-symbols-outlined">volume_up</span>
</button>
</div>
<div className="absolute bottom-4 right-4 flex gap-2">
<button aria-label="Copy" className="flex items-center justify-center p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
<span className="material-symbols-outlined">content_copy</span>
</button>
</div>
</div>
</div>
</div>

<div className="mt-8 flex justify-center items-center gap-4">
<button
  onClick={stopRecording} 
  disabled={!isRecording} 
  className="bg-red-500 text-white px-6 py-3 rounded-lg text-base font-semibold hover:bg-red-600 transition-colors flex items-center gap-2">
<span className="material-symbols-outlined">stop</span>
                            Stop
                        </button>
                        <button 
            onClick={testConnection}
            className="test-btn"
          >
            🔍 Test Connection
          </button>
          
          
</div>
      </div>
    </div>

</main>
    </div>
    </div>
  );
};

export default App;