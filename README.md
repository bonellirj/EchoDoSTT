# EchoDoSTT Node

A Node.js serverless function for audio transcription using OpenAI's Whisper API.

## Environment Variables

The following environment variables can be configured:

### Required
- `OPENAI_API_KEY` - Your OpenAI API key for authentication

### Optional (with defaults)
- `OPENAI_API_URL` - OpenAI API endpoint for transcriptions (default: `https://api.openai.com/v1/audio/transcriptions`)
- `MAX_FILE_SIZE_BYTES` - Maximum file size in bytes (default: `1048576` = 1MB)

## Example Configuration

```bash
# Required
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional - customize if needed
OPENAI_API_URL=https://api.openai.com/v1/audio/transcriptions
MAX_FILE_SIZE_BYTES=1048576
```

## Usage

The function accepts POST requests with multipart/form-data containing an audio file and a timestamp parameter.

### Request Format
- Method: `POST`
- Content-Type: `multipart/form-data`
- Query Parameters: `timestamp` (required)
- Body: Audio file in multipart form data

### Response Format
```json
{
  "timestamp": "your-timestamp",
  "transcription": "transcribed audio text"
}
``` 