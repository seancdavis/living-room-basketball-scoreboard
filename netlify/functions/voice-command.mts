import Anthropic from '@anthropic-ai/sdk';
import type { Context } from '@netlify/functions';

const SYSTEM_PROMPT = `You are a voice command interpreter for a basketball scoring app. Your job is to interpret spoken commands and return the appropriate action.

The app has two modes:
- MULTIPLIER MODE: Player is building up a multiplier by making longer shots
- POINT MODE: Player is scoring points with shorter shots

Available actions:
- "make" - Player made a shot
- "miss" - Player missed a shot
- "enter_point_mode" - Switch from multiplier mode to point mode
- "enter_multiplier_mode" - Switch from point mode to multiplier mode (only allowed after passing a multiple of 10)
- "start_session" - Start a new 10-minute session
- "start_game" - Start a new game within a session
- "end_session" - End the current session
- "pause" - Pause the timer
- "resume" - Resume the timer (same as pause, it toggles)
- "unknown" - Command not recognized

Respond with ONLY a JSON object in this exact format:
{"action": "action_name", "confidence": 0.0-1.0}

Examples of voice commands and their actions:
- "made it", "swish", "yes", "got it", "make", "in", "score" → {"action": "make", "confidence": 0.95}
- "missed", "miss", "no", "brick", "air ball", "out" → {"action": "miss", "confidence": 0.95}
- "point mode", "points", "go to points", "switch to points" → {"action": "enter_point_mode", "confidence": 0.9}
- "multiplier mode", "multiplier", "go to multiplier", "build multiplier" → {"action": "enter_multiplier_mode", "confidence": 0.9}
- "start", "begin", "let's go", "start session" → {"action": "start_session", "confidence": 0.85}
- "new game", "restart", "start over" → {"action": "start_game", "confidence": 0.85}
- "end", "stop", "finish", "end session" → {"action": "end_session", "confidence": 0.85}
- "pause", "hold", "wait", "timeout", "time out" → {"action": "pause", "confidence": 0.9}
- "resume", "continue", "go", "unpause", "play" → {"action": "resume", "confidence": 0.9}

Be flexible with pronunciation and similar-sounding words. If unsure, return unknown with low confidence.`;

interface VoiceCommandRequest {
  transcript: string;
}

interface VoiceCommandResponse {
  action: string;
  confidence: number;
  error?: string;
}

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as VoiceCommandRequest;
    const { transcript } = body;

    if (!transcript || typeof transcript !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing transcript' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if AI Gateway is configured
    if (!process.env.ANTHROPIC_BASE_URL) {
      return new Response(JSON.stringify({
        error: 'AI Gateway not configured. Deploy to Netlify first.',
        action: 'unknown',
        confidence: 0
      } satisfies VoiceCommandResponse), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const anthropic = new Anthropic();

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Interpret this voice command: "${transcript}"`
        }
      ]
    });

    // Parse the response
    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';

    try {
      // Try to parse the JSON response
      const result = JSON.parse(responseText) as VoiceCommandResponse;
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch {
      // If parsing fails, try to extract action from text
      const lowerResponse = responseText.toLowerCase();
      let action = 'unknown';

      if (lowerResponse.includes('make')) action = 'make';
      else if (lowerResponse.includes('miss')) action = 'miss';
      else if (lowerResponse.includes('point_mode')) action = 'enter_point_mode';
      else if (lowerResponse.includes('multiplier_mode')) action = 'enter_multiplier_mode';
      else if (lowerResponse.includes('start_session')) action = 'start_session';
      else if (lowerResponse.includes('start_game')) action = 'start_game';
      else if (lowerResponse.includes('end_session')) action = 'end_session';
      else if (lowerResponse.includes('pause')) action = 'pause';
      else if (lowerResponse.includes('resume')) action = 'resume';

      return new Response(JSON.stringify({ action, confidence: 0.5 } satisfies VoiceCommandResponse), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Voice command error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      error: errorMessage,
      action: 'unknown',
      confidence: 0
    } satisfies VoiceCommandResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  path: '/api/voice-command'
};
