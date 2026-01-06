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
import { v2 as GoogleTranslate } from '@google-cloud/translate';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://voice-translator-1-6ty3.onrender.com", "http://localhost:3000"],
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

let googleTranslateClient;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  googleTranslateClient = new GoogleTranslate.Translate();
}

const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;


const DEBUG_TRANSLATIONS = true;

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

async function mockSpeechToText(audioBuffer) {
  console.log('🎯 Using mock STT - returning test text');
  return "This is a test translation from the mock service";
}

async function mockTranslation(text, sourceLang, targetLang) {
  console.log('🔄 Mock translation:', { text, sourceLang, targetLang });
  return `[Translated to ${targetLang}] ${text}`;
}
async function mockTextToSpeech(text, language) {
  console.log('🔊 Mock TTS for:', text);
  return Buffer.from('mock-audio-data');
}

async function processAudioPipeline(audioData, sourceLang = 'auto', targetLang = 'es', socket) {
  console.log('🚀 Starting audio processing pipeline...');

  try {
    let audioBuffer;

    if (Buffer.isBuffer(audioData)) {
      audioBuffer = audioData;
    } else if (audioData?.arrayBuffer) {
      audioBuffer = Buffer.from(await audioData.arrayBuffer());
    } else {
      audioBuffer = Buffer.from(audioData);
    }

    console.log('📊 Audio buffer size:', audioBuffer.length, 'bytes');

    if (audioBuffer.length < 1000) {
      throw new Error('Audio buffer too small - may be empty');
    }

    let originalText;
    let translatedText;
    let detectedSourceLang = sourceLang;

    try {
      console.log('🎙️ Attempting STT...');
      originalText = await speechToTextWithHuggingFace(audioBuffer);
      console.log('✅ STT successful:', originalText);

      // Emit the transcribed text immediately to the client
      if (socket) {
        console.log('📤 Sending intermediate transcription to client');
        socket.emit('transcription-update', { originalText });
      }
    } catch (sttError) {
      console.log('❌ STT failed, using mock:', sttError.message);
      originalText = await mockSpeechToText(audioBuffer);
    }

    // If source language is 'auto', detect it from the transcribed text
    if (sourceLang === 'auto') {
      try {
        if (googleTranslateClient) {
          console.log('🕵️ Auto-detecting language with Google from text:', `"${originalText}"`);
          const [detection] = await googleTranslateClient.detect(originalText);
          detectedSourceLang = detection.language;
          console.log(`✅ Language detected by Google: ${detectedSourceLang} (Confidence: ${detection.confidence})`);
        } else {
          console.warn('⚠️ Google credentials not found. Falling back to Hugging Face for language detection.');
          detectedSourceLang = await detectLanguageWithHuggingFace(originalText);
          console.log(`✅ Language detected by Hugging Face: ${detectedSourceLang}`);
        }
      } catch (detectError) {
        throw new Error(`Language detection failed: ${detectError.message}. Please select a source language manually.`);
      }
    }

    // If detected language is the same as the target, skip translation
    if (detectedSourceLang === targetLang) {
      console.log('✅ Source and target languages are the same. Skipping translation.');
      translatedText = originalText;
    } else {
      // Translation
      try {
        console.log('🌐 Attempting translation...');
        translatedText = await translateWithHuggingFace(originalText, detectedSourceLang, targetLang);
        console.log('✅ Translation successful');
      } catch (transError) {
        console.log('❌ Translation failed, using mock:', transError.message);
        translatedText = await mockTranslation(originalText, detectedSourceLang, targetLang);
      }
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
    return { audio: translatedAudio, text: translatedText, originalText: originalText };

  } catch (error) {
    console.error('💥 Pipeline error:', error);
    throw error;
  }
}

// Hugging Face implementations (with better error handling)
async function speechToTextWithHuggingFace(audioBuffer) {
  // Fast models that work on router.huggingface.co/hf-inference
  const models = [
    'openai/whisper-base',       // Faster, good quality
    'openai/whisper-large-v3',   // Fallback for better accuracy
  ];

  for (const model of models) {
    try {

      console.log(`🎙️ Sending audio to STT model: ${model}, size: ${audioBuffer.length}`); // Corrected a typo here from "ssize" to "size"
      const response = await axios.post(
        `https://router.huggingface.co/hf-inference/models/${model}`,
        audioBuffer,
        {
          headers: {
            'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
            'Accept': 'application/json',
            'Content-Type': 'audio/webm' // Explicitly tell the API what format the audio is in
          },
          responseType: 'json',
          timeout: 15000  // Reduced from 30s for faster response
        }
      );

      // Check for a valid text response and return it
      if (response.data && typeof response.data.text === 'string') {
        console.log(`✅ STT successful with model: ${model}`);
        return response.data.text;
      }
    } catch (error) {
      console.warn(`- STT model ${model} failed:`, error.response?.data?.error || error.message);
      // If one model fails, the loop will continue to the next one.
    }
  }

  // If all models in the loop fail, throw an error to trigger the mock service
  throw new Error('All STT models failed.');
}

async function detectLanguageWithHuggingFace(text) {
  const model = 'papluca/xlm-roberta-base-language-detection'; // Corrected a typo here from "xllm" to "xlm"
  console.log(`🕵️ Detecting language with Hugging Face model: ${model}`);
  try {
    const response = await axios.post(
      `https://router.huggingface.co/hf-inference/models/${model}`,
      { inputs: text },
      {
        headers: {
          'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000  // Reduced timeout for faster detection
      }
    );

    // The model returns an array of label/score objects. The first one is the most likely.
    if (response.data && Array.isArray(response.data[0]) && response.data[0].length > 0) {
      const topResult = response.data[0][0];
      if (topResult.label) {
        return topResult.label;
      }
    }
    throw new Error('Invalid response format from language detection model.');

  } catch (error) {
    const errorMessage = error.response?.data?.error || error.message;
    console.error(`- Language detection with ${model} failed:`, errorMessage);
    throw new Error(`Hugging Face language detection failed: ${errorMessage}`);
  }
}

async function translateWithHuggingFace(text, sourceLang, targetLang) {
  // Update Strategy 0: Prioritize Google Translate for Japanese
  if (targetLang === 'ja' || sourceLang === 'ja') {
    if (googleTranslateClient) {
      try {
        console.log('🌐 Using Google Translate for Japanese...');
        const [translation] = await googleTranslateClient.translate(text, {
          from: sourceLang,
          to: targetLang
        });
        console.log('✅ Google Translation successful');
        return translation;
      } catch (error) {
        console.warn('❌ Google Translate failed:', error.message);
      }
    }
  }

  // Strategy 1: Try direct translation with Helsinki-NLP models
  const modelName = `Helsinki-NLP/opus-mt-${sourceLang}-${targetLang}`;
  try {
    const translatedText = await doTranslation(text, modelName);
    if (translatedText) return translatedText;
  } catch (error) {
    console.log(`- Direct translation with ${modelName} failed. Attempting pivot...`);
  }

  // Strategy 2: Pivot through English (for non-ja/zh sources)
  if (sourceLang !== 'en' && targetLang !== 'en') {
    console.log('🔄 Pivoting translation through English...');
    const textInEnglish = await doTranslation(text, `Helsinki-NLP/opus-mt-${sourceLang}-en`);
    if (textInEnglish) {
      const translatedText = await doTranslation(textInEnglish, `Helsinki-NLP/opus-mt-en-${targetLang}`);
      if (translatedText) return translatedText;
    }
  }
  // If all strategies fail, throw an error to trigger the mock fallback
  throw new Error('All translation strategies failed.');
}

// Update the doTranslation function to handle different model types
const doTranslation = async (inputText, model, params = {}) => {
  // Simplified doTranslation function
  try {
    console.log(`🌐 Attempting translation with model: ${model}`);
    const payload = {
      inputs: inputText,
      options: { wait_for_model: true },
      ...params
    };
    const response = await axios.post(
      `https://router.huggingface.co/hf-inference/models/${model}`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000  // Increased to 30s to prevent timeouts
      }
    );

    // Handle different response formats
    if (response.data) {
      if (Array.isArray(response.data) && response.data[0]?.translation_text) {
        return response.data[0].translation_text;
      } else if (typeof response.data.translation === 'string') {
        return response.data.translation;
      } else if (typeof response.data === 'string') {
        return response.data;
      }
    }
    throw new Error('Invalid response format from translation model');
  } catch (error) {
    console.error(`❌ Translation failed with model ${model}:`, error.message);
    throw error;
  }
};

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
      `https://router.huggingface.co/hf-inference/models/${model}`,
      { inputs: text },
      {
        headers: {
          'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'audio/wav' // Bark model typically returns wav
        },
        responseType: 'arraybuffer',
        timeout: 20000 // Reduced from 45s for faster TTS
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
          `https://router.huggingface.co/hf-inference/models/${fallbackModel}`,
          { inputs: text },
          {
            headers: {
              'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
              'Content-Type': 'application/json',
              'Accept': 'audio/wav'
            },
            responseType: 'arraybuffer',
            timeout: 15000  // Reduced timeout for fallback models
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
      const result = await processAudioPipeline(audioData, sourceLang, targetLang, socket);
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