import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const VoiceTranslator = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [status, setStatus] = useState('Ready');
  const recognitionRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('http://localhost:5000');
    
    socketRef.current.on('translated-audio', (audioData) => {
      playAudio(audioData);
      setStatus('Translation complete');
    });
    
    socketRef.current.on('error', (error) => {
      setStatus(`Error: ${error}`);
    });
    
    // Initialize browser speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        
        setTranscript(finalTranscript || interimTranscript);
        
        // Send final results for translation
        if (finalTranscript) {
          translateText(finalTranscript);
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setStatus(`Speech error: ${event.error}`);
        setIsListening(false);
      };
      
      recognitionRef.current.onend = () => {
        if (isListening) {
          // Restart recognition if still listening
          recognitionRef.current.start();
        }
      };
    } else {
      setStatus('Speech recognition not supported in this browser');
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);
  
  const translateText = async (text) => {
    try {
      setStatus('Translating...');
      const response = await fetch('http://localhost:5000/api/test-translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          sourceLang: 'en', 
          targetLang: 'es' 
        })
      });
      
      const data = await response.json();
      setTranslatedText(data.translated);
      setStatus('Translation ready');
      
      // Convert translated text to speech
      textToSpeech(data.translated);
    } catch (error) {
      setStatus('Translation failed');
      console.error('Translation error:', error);
    }
  };
  
  const textToSpeech = async (text) => {
    try {
      setStatus('Converting to speech...');
      
      // Send text to server for TTS processing
      const response = await fetch('http://localhost:5000/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: 'es' })
      });
      
      const audioBlob = await response.blob();
      playAudioBlob(audioBlob);
    } catch (error) {
      // Fallback to browser TTS
      browserTextToSpeech(text);
    }
  };
  
  const browserTextToSpeech = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      window.speechSynthesis.speak(utterance);
      setStatus('Speaking...');
    } else {
      setStatus('Browser TTS not supported');
    }
  };
  
  const playAudio = (audioBuffer) => {
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    playAudioBlob(audioBlob);
  };
  
  const playAudioBlob = (audioBlob) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();
    audio.onended = () => URL.revokeObjectURL(audioUrl);
  };
  
  const startListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setIsListening(true);
      setStatus('Listening...');
      setTranscript('');
      setTranslatedText('');
    }
  };
  
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setStatus('Stopped');
    }
  };
  
  return (
    <div className="voice-translator">
      <h2>Free Voice Translator</h2>
      
      <div className="controls">
        <button 
          onClick={isListening ? stopListening : startListening}
          className={isListening ? 'stop' : 'start'}
        >
          {isListening ? '🛑 Stop' : '🎤 Start'}
        </button>
        
        <div className="status">{status}</div>
      </div>
      
      <div className="results">
        <div className="transcript">
          <h3>You said:</h3>
          <p>{transcript}</p>
        </div>
        
        <div className="translation">
          <h3>Translation:</h3>
          <p>{translatedText}</p>
        </div>
      </div>
    </div>
  );
};

export default VoiceTranslator;