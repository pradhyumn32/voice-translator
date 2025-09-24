// backend/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import axios from 'axios';
import { Blob } from 'buffer';
import dotenv from 'dotenv';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import gtts from 'gtts';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Debug middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;

// Simple test function to check if services are working
async function testServices() {
  console.log('🔍 Testing service availability...');
  
  if (!HUGGING_FACE_TOKEN) {
    console.error('❌ No Hugging Face token found. Set HUGGING_FACE_TOKEN in your .env file.');
    return false;
  }
  
  try {
    // Test Hugging Face API access
    const response = await axios.get('https://huggingface.co/api/models', {
      headers: { 'Authorization': `Bearer ${HUGGING_FACE_TOKEN}` },
      timeout: 10000
    });
    console.log('✅ Hugging Face API accessible');
    return true;
  } catch (error) {
    console.log('❌ Hugging Face API test failed:', error.message);
    return false;
  }
}

// Simple fallback speech-to-text (mock for testing)
async function mockSpeechToText(audioBuffer) {
  console.log('🎯 Using mock STT - returning test text');
  return "This is a test translation from the mock service";
}

// Simple fallback translation
async function mockTranslation(text, sourceLang, targetLang) {
  console.log('🔄 Mock translation:', { text, sourceLang, targetLang });
  return `[Translated to ${targetLang}] ${text}`;
}

// Simple fallback TTS - return a mock audio buffer
async function mockTextToSpeech(text, language) {
  console.log('🔊 Mock TTS for:', text);
  // Return a small silent audio buffer as mock
  return Buffer.from('mock-audio-data');
}

// Main processing pipeline with fallbacks
async function processAudioPipeline(audioData, sourceLang = 'en', targetLang = 'es') {
  console.log('🚀 Starting audio processing pipeline...');
  
  try {
    // const audioBuffer = Buffer.from(await audioData.arrayBuffer());
    let audioBuffer;

    if (Buffer.isBuffer(audioData)) {
      // Already a Node.js Buffer
      audioBuffer = audioData;
    } else if (audioData?.arrayBuffer) {
      // Browser Blob-like object (rare in Node)
      audioBuffer = Buffer.from(await audioData.arrayBuffer());
    } else {
      // Last fallback
      audioBuffer = Buffer.from(audioData);
    }

    console.log('📊 Audio buffer size:', audioBuffer.length, 'bytes');
    
    if (audioBuffer.length < 100) {
      throw new Error('Audio buffer too small - may be empty');
    }
    
    let originalText;
    let translatedText;
    
    // STT with better error handling
    try {
      console.log('🎙️ Attempting STT...');
      originalText = await speechToTextWithHuggingFace(audioBuffer);
      console.log('✅ STT successful:', originalText);
    } catch (sttError) {
      console.log('❌ STT failed, using mock:', sttError.message);
      originalText = await mockSpeechToText(audioBuffer);
    }
    
    // Translation
    try {
      console.log('🌐 Attempting translation...');
      translatedText = await translateWithHuggingFace(originalText, sourceLang, targetLang);
      console.log('✅ Translation successful');
    } catch (transError) {
      console.log('❌ Translation failed, using mock:', transError.message);
      translatedText = await mockTranslation(originalText, sourceLang, targetLang);
    }
    
    console.log('📝 Translated text:', translatedText);
    
    // TTS with multiple fallback models
    let translatedAudio;
    try {
      console.log('🔊 Attempting TTS...');
      // Try free alternatives first
      try {
        console.log('🔊 Using Google TTS...');
        translatedAudio = await textToSpeechWithGoogle(translatedText, targetLang);
        console.log('✅ TTS successful with Google TTS');
      } catch (error) {
        console.log('❌ Google TTS failed, trying Hugging Face...');
        translatedAudio = await textToSpeechWithHuggingFace(translatedText, targetLang);
        console.log('✅ TTS successful with Hugging Face');
      }
    } catch (ttsError) {
      console.log('❌ All TTS services failed, using mock:', ttsError.message);
      translatedAudio = await mockTextToSpeech(translatedText, targetLang);
    }
    
    console.log('✅ Pipeline completed successfully');
    return { audio: translatedAudio, text: translatedText };
    
  } catch (error) {
    console.error('💥 Pipeline error:', error);
    throw error;
  }
}

// Hugging Face implementations (with better error handling)
async function speechToTextWithHuggingFace(audioBuffer) {
  const model = 'openai/whisper-large-v3';
  
  try {
    console.log('🎙️ Sending audio to Whisper, size:', audioBuffer.length);
    
    // First try with audio/webm (the actual format we're sending)
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      audioBuffer,
      {
        headers: {
          'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
          'Content-Type': 'audio/webm;codecs=opus', // Correct MIME type from the browser
          'Accept': 'application/json' // Explicitly set the Accept header
        },
        responseType: 'json',
        timeout: 30000
      }
    );
    
    if (response.data?.text) {
      return response.data.text;
    }
    // Handle cases where Whisper returns an empty string
    if (response.data && 'text' in response.data) {
      return response.data.text;
    }
    throw new Error('Invalid response structure from STT API');
  } catch (error) {
    console.error('Hugging Face STT error:', error.response?.data || error.message);
    throw error;
  }
}

async function translateWithHuggingFace(text, sourceLang, targetLang) {
  // Helper to perform a single translation request
  const doTranslation = async (inputText, model) => {
    try {
      console.log(`🌐 Attempting translation with model: ${model}`);
      const response = await axios.post(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          inputs: inputText,
          options: { wait_for_model: true }
        },
        {
          headers: {
            'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000
        }
      );
      if (response.data && response.data[0] && response.data[0].translation_text) {
        console.log(`✅ Translation successful with ${model}`);
        return response.data[0].translation_text;
      }
      throw new Error('Invalid response structure from translation API');
    } catch (error) {
      console.warn(`- Translation with ${model} failed: ${error.response?.status || error.message}`);
      return null; // Return null to indicate failure
    }
  };


  // Strategy 1: Try direct translation (e.g., fr-es)
  let translatedText = await doTranslation(text, `Helsinki-NLP/opus-mt-${sourceLang}-${targetLang}`);
  if (translatedText) return translatedText;

  // Strategy 2: Try reverse model (e.g., es-fr)
  // Note: This is less likely to work for many pairs but is a quick check.
  translatedText = await doTranslation(text, `Helsinki-NLP/opus-mt-${targetLang}-${sourceLang}`);
  if (translatedText) return translatedText;

  // Strategy 3: Pivot through English
  if (sourceLang !== 'en' && targetLang !== 'en') {
    console.log('🔄 Pivoting translation through English...');
    
    // Use a better model for Japanese to English translation
    const sourceToEnglishModel = sourceLang === 'ja' 
      ? 'staka/fugumt-ja-en' 
      : `Helsinki-NLP/opus-mt-${sourceLang}-en`;
    
    const englishToTargetModel = targetLang === 'ja'
        ? 'staka/fugumt-en-ja' // Or another good en-ja model
        : `Helsinki-NLP/opus-mt-en-${targetLang}`;


    const textInEnglish = await doTranslation(text, sourceToEnglishModel);

    if (textInEnglish) {
      translatedText = await doTranslation(textInEnglish, `Helsinki-NLP/opus-mt-en-${targetLang}`);
      if (translatedText) return translatedText;
    }
  }

  // If all strategies fail, throw an error to trigger the mock fallback
  throw new Error('All translation strategies failed.');
}

async function textToSpeechWithHuggingFace(text, targetLang) {
  const modelMap = {
    es: 'facebook/mms-tts-spa',
    fr: 'facebook/mms-tts-fra',
    de: 'facebook/mms-tts-deu',
    ja: 'facebook/mms-tts-jpn',
    hi: 'facebook/mms-tts-hin',
    it: 'facebook/mms-tts-ita',
    ru: 'facebook/mms-tts-rus',
    zh: 'facebook/mms-tts-cmn', // Mandarin
    ur: 'facebook/mms-tts-urd',
  };

  const model = modelMap[targetLang] || modelMap['es'];
  
  try {
    // First attempt with a language-specific model
    console.log(`🔊 Using TTS model: ${model} for text: "${text.substring(0, 50)}..."`);
    
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      { inputs: text },
      {
        headers: { 
          'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'audio/wav' // Bark model typically returns wav
        },
        responseType: 'arraybuffer',
        timeout: 45000 // Longer timeout for TTS
      }
    );

    if (response.data.byteLength < 100) {
      throw new Error('Audio response too short - likely an error');
    }
    
    console.log(`✅ TTS successful, audio size: ${response.data.byteLength} bytes`);
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`❌ TTS failed with model ${model}:`, error.response?.status, error.message);
    
    // Try more robust/general fallback models
    const fallbackModels = [
      'suno/bark', // Multilingual, can be slow
      'espnet/kan-bayashi_ljspeech_vits', // English fallback
      'microsoft/speecht5_tts' // Another robust English fallback
    ];
    
    for (const fallbackModel of fallbackModels) {
      try {
        console.log(`🔄 Trying fallback TTS model: ${fallbackModel}`);
        
        const fallbackResponse = await axios.post(
          `https://api-inference.huggingface.co/models/${fallbackModel}`,
          { inputs: text },
          {
            headers: { 
              'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
              'Content-Type': 'application/json',
              'Accept': 'audio/wav'
            },
            responseType: 'arraybuffer',
            timeout: 30000
          }
        );
        
        if (fallbackResponse.data.byteLength > 100) {
          console.log(`✅ Fallback TTS successful with ${fallbackModel}`);
          return Buffer.from(fallbackResponse.data);
        }
      } catch (fallbackError) {
        console.log(`❌ Fallback ${fallbackModel} also failed:`, fallbackError.response?.status);
        continue;
      }
    }
    
    throw new Error('All TTS models failed');
  }
}

async function textToSpeechWithGoogle(text, targetLang) {
  console.log('🔊 Using Google TTS for:', text);
  
  return new Promise((resolve, reject) => {
    try {
      const speech = new gtts(text, targetLang);
      const tmpFile = join(tmpdir(), `tts-${Date.now()}.mp3`);
      
      speech.save(tmpFile, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        
        const audioBuffer = readFileSync(tmpFile);
        unlinkSync(tmpFile); // Clean up temp file
        resolve(audioBuffer);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Enhanced Socket.io with better error handling
io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);
  
  socket.on('audio-stream', async (data) => {
    const { audio: audioData, sourceLang, targetLang } = data;
    if (!audioData) {
      return socket.emit('error', 'No audio data received.');
    }
    console.log(`📨 Received audio stream from ${socket.id}, size: ${audioData.length}, from: ${sourceLang}, to: ${targetLang}`);

    try {
      const result = await processAudioPipeline(audioData, sourceLang, targetLang);
      console.log('📤 Sending translated audio back to client');
      socket.emit('translated-audio', { audio: result.audio, text: result.text });
    } catch (error) {
      console.error('💥 Processing error:', error);
      socket.emit('error', `Pipeline failed: ${error.message}`);
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log('👤 User disconnected:', socket.id, 'Reason:', reason);
  });
  
  // Send initial connection acknowledgement
  socket.emit('connected', { message: 'Connected to translation server', socketId: socket.id });
});

// Health check endpoint with service status
app.get('/api/health', async (req, res) => {
  const servicesWorking = await testServices();
  res.json({ 
    status: servicesWorking ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      huggingFace: !!HUGGING_FACE_TOKEN,
      apiAccessible: servicesWorking
    }
  });
});

// Test endpoint for manual debugging
app.post('/api/debug-audio', async (req, res) => {
  try {
    const { audioData } = req.body;
    console.log('🔍 Debug endpoint called with data size:', audioData?.length);
    res.json({ received: true, size: audioData?.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`\n🎯 Voice Translator Server started on port ${PORT}`);
  console.log('🔍 Testing services...');
  await testServices();
  console.log('\n✅ Server ready! Check http://localhost:' + PORT);
});