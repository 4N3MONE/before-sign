# Debug Guide for Before.sign LLM Calls

## Quick Debug Steps

### 1. Check Environment Configuration
Visit: `http://localhost:3000/api/debug`

This endpoint will show:
- ✅ Environment variables status
- 🔗 API connectivity test  
- ⚙️ Model configuration
- 📊 Response times

### 2. Monitor Console Logs

When you upload a contract and analyze it, look for these console logs:

#### Environment Check
```
🔧 Environment Check: {
  has_api_key: true,
  api_key_length: 47,
  api_key_preview: "up-abc123...xyz789",
  model_name: "solar-pro2-preview",
  model_name_source: "env_var"
}
```

#### LLM Request Details
```
🔥 LLM Call #1 - Model: solar-pro2-preview
📝 Request Body: {
  model: "solar-pro2-preview",
  temperature: 0.1,
  max_tokens: 4000,
  top_p: 0.9,
  reasoning_effort: "high",
  messages_count: 2,
  has_json_schema: true,
  first_message_preview: "You are an expert legal contract analyst..."
}
```

#### API Call Progress
```
📡 Making API request to Upstage (attempt 1/4)...
📊 Response Status: 200 OK
📊 Response Headers: { "content-type": "application/json", ... }
```

#### Success Response
```
✅ Raw Response Body (first 500 chars): {"id":"chatcmpl-123","object":"chat.completion"...
✅ Parsed Response: {
  id: "chatcmpl-123",
  model: "solar-pro2-preview", 
  choices_count: 1,
  finish_reason: "stop",
  content_length: 1234,
  usage: { prompt_tokens: 500, completion_tokens: 300 }
}
⏱️ Call completed in 2340ms (total: 2340ms)
📋 Response Content Preview: {"risks":[{"title":"Unlimited Liability"...
```

#### Error Details
```
❌ Error Response Body: {"error":{"message":"internal_server_error","type":"internal_server_error"}}
❌ Parsed Error: {
  error: {
    message: "internal_server_error",
    type: "internal_server_error", 
    param: null,
    code: null
  }
}
❌ Error Type: Error
❌ Error Message: Upstage SolarLLM API error: 500 - {"error":{"message":"internal_server_error"}}
```

## Common Issues & Solutions

### ❌ 500 Internal Server Error
**Symptoms:** `internal_server_error` from Upstage API
**Possible Causes:**
- Upstage API temporary issues
- Model overloaded
- Invalid request format

**Solutions:**
1. Check `/api/debug` endpoint for connectivity
2. Wait a few minutes and retry
3. Check if `solar-pro2-preview` model is available
4. Try switching to `solar-pro` model by setting:
   ```
   UPSTAGE_MODEL_NAME=solar-pro
   ```

### ❌ 401 Unauthorized
**Symptoms:** `401` status code
**Solutions:**
1. Verify your API key in `.env.local`
2. Check API key format starts with `up-`
3. Ensure API key has proper permissions

### ❌ 429 Rate Limited
**Symptoms:** `429` status code
**Solutions:**
1. Wait for rate limit reset
2. Check your Upstage plan limits

### ❌ Network/Timeout Errors
**Symptoms:** `AbortError` or connection timeouts
**Solutions:**
1. Check internet connectivity
2. Verify firewall settings
3. Try increasing timeout (currently 300 seconds)

## Debug Endpoint Response

`GET /api/debug` returns:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": {
    "hasApiKey": true,
    "apiKeyLength": 47, 
    "apiKeyPreview": "up-abc123...xyz789",
    "modelName": "solar-pro2-preview",
    "modelNameSource": "environment_variable",
    "nodeEnv": "development"
  },
  "apiConnectivity": {
    "canConnect": true,
    "error": null,
    "statusCode": 200,
    "responseTime": 245
  },
  "urls": {
    "chatCompletions": "https://api.upstage.ai/v1/chat/completions",
    "models": "https://api.upstage.ai/v1/models"
  }
}
```

## Log Prefixes

- `🔧` Environment configuration
- `🔥` New LLM call started  
- `📝` Request details
- `📡` Making API request
- `📊` Response received
- `✅` Successful response
- `❌` Error occurred
- `⏱️` Timing information
- `📋` Content preview
- `⏳` Retrying
- `🚫` Final failure

## Getting Help

1. Run `/api/debug` and share the output
2. Copy relevant console logs with emojis
3. Note the specific error message and status code
4. Check the Upstage API status page 