import { Readable } from 'stream';
import busboy from 'busboy';
import fetch from 'node-fetch';

const MAX_FILE_SIZE_BYTES = process.env.MAX_AUDIO_FILE_SIZE_BYTES; 
const OPENAI_API_URL = process.env.OPENAI_API_URL;
const TEXT_TO_TASK_API_URL = process.env.TEXT_TO_TASK_API_URL;
const SUPPORTED_TEXT_TO_TASK_LLM = process.env.SUPPORTED_TEXT_TO_TASK_LLM?.split(',') || [];
const SUPPORTED_SPEECH_TO_TEXT_LLM = process.env.SUPPORTED_SPEECH_TO_TEXT_LLM?.split(',') || [];

export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod;
    if (method !== 'POST') {
      return _response(405, { error: 'Method Not Allowed' });
    }

    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    
    if (!contentType?.includes('multipart/form-data')) {
      return _response(400, { error: 'Missing or invalid content type' });
    }

    // Parse the request body to get timestamp and LLM parameters
    const bodyBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
    const bb = busboy({ headers: { 'content-type': contentType } });

    let fileBuffer = Buffer.alloc(0);
    let fileMime = '';
    let fileFound = false;
    let timestamp = '';
    let textToTaskLLM = '';
    let speechToTextLLM = '';

    const parsePromise = new Promise((resolve, reject) => {
      bb.on('field', (name, value) => {
        if (name === 'timestamp') {
          timestamp = value;
        } else if (name === 'TextToTaskLLM') {
          textToTaskLLM = value;
        } else if (name === 'SpeachToTextLLM') {
          speechToTextLLM = value;
        }
      });

      bb.on('file', (fieldname, file, info) => {
        const { mimeType } = info;
        fileMime = mimeType;
        fileFound = true;

        file.on('data', (data) => {
          fileBuffer = Buffer.concat([fileBuffer, data]);
          if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
            reject(new Error('Payload Too Large'));
          }
        });
      });

      bb.on('finish', () => {
        resolve();
      });

      bb.on('error', reject);
    });

    Readable.from(bodyBuffer).pipe(bb);
    await parsePromise;

    // Validate required parameters
    if (!timestamp) {
      return _response(400, { error: 'Missing timestamp parameter' });
    }

    if (!textToTaskLLM) {
      return _response(400, { error: 'Missing TextToTaskLLM parameter' });
    }

    if (!speechToTextLLM) {
      return _response(400, { error: 'Missing SpeachToTextLLM parameter' });
    }

    // Validate LLM support
    if (!SUPPORTED_TEXT_TO_TASK_LLM.includes(textToTaskLLM)) {
      return _response(400, { 
        error: 'Unsupported TextToTaskLLM', 
        supported: SUPPORTED_TEXT_TO_TASK_LLM,
        provided: textToTaskLLM
      });
    }

    if (!SUPPORTED_SPEECH_TO_TEXT_LLM.includes(speechToTextLLM)) {
      return _response(400, { 
        error: 'Unsupported SpeachToTextLLM', 
        supported: SUPPORTED_SPEECH_TO_TEXT_LLM,
        provided: speechToTextLLM
      });
    }

    if (!fileFound || !fileMime.includes('/webm')) {
      return _response(400, { error: 'Missing or invalid audio file' });
    }

    // Step 1: Convert speech to text using OpenAI Whisper
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return _response(500, { error: 'Missing OpenAI API key' });
    }

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], { type: fileMime }), 'audio.webm');
    formData.append('model', 'whisper-1');

    const whisperResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`
      },
      body: formData
    });

    const whisperResultText = await whisperResponse.text();

    if (!whisperResponse.ok) {
      console.error(`Whisper error ${whisperResponse.status}: ${whisperResultText}`);
      return _response(whisperResponse.status, {
        error: 'OpenAI error',
        status: whisperResponse.status,
        details: whisperResultText
      });
    }

    const whisperResult = JSON.parse(whisperResultText);
    const transcription = whisperResult.text;

    // Step 2: Convert text to task using the new API
    const taskResponse = await fetch(TEXT_TO_TASK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: transcription,
        llm: textToTaskLLM
      })
    });

    const taskResultText = await taskResponse.text();

    if (!taskResponse.ok) {
      console.error(`TextToTask API error ${taskResponse.status}: ${taskResultText}`);
      return _response(taskResponse.status, {
        error: 'TextToTask API error',
        status: taskResponse.status,
        details: taskResultText
      });
    }

    const taskResult = JSON.parse(taskResultText);

    return _response(200, {
      timestamp,
      transcription,
      task: taskResult
    });

  } catch (err) {
    console.error('Unhandled error', err);
    return _response(500, {
      error: 'Internal server error',
      message: err.message,
      stack: err.stack
    });
  }
};

function _response(statusCode, body) {
  return {
    statusCode,
    body: JSON.stringify(body)
  };
}
