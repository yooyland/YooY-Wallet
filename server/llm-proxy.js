// Simple multi-provider LLM proxy (OpenAI / Anthropic / Groq)
// Usage:
//   OPENAI_API_KEY=... node server/llm-proxy.js
//   ANTHROPIC_API_KEY=... GROQ_API_KEY=... (optional)
// Endpoint:
//   POST /llm  { question, context, provider?, model? } -> { answer }
// Notes:
//   - Keep API keys on server only. Do NOT expose them to the client.

import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const DEFAULT_PROVIDER =
  process.env.PROVIDER_DEFAULT || 'openai'; // 'openai' | 'anthropic' | 'groq'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const pick = (obj, keys) => {
  const out = {};
  keys.forEach((k) => {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  });
  return out;
};

// Provider callers
async function callOpenAI({ question, context, model }) {
  const apiKey = OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const sys =
    'You are a crypto market assistant. Answer clearly and concisely. Use the JSON context when helpful.';
  const body = {
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: `${sys}\nContext: ${JSON.stringify(context)}` },
      { role: 'user', content: String(question || '') },
    ],
    temperature: 0.2,
  };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI ${resp.status}: ${JSON.stringify(pick(data, ['error']))}`);
  }
  const answer =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    data?.output_text ??
    '';
  return answer;
}

async function callAnthropic({ question, context, model }) {
  const apiKey = ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const sys =
    'You are a crypto market assistant. Answer clearly and concisely. Use the JSON context when helpful.';
  const body = {
    model: model || 'claude-3-5-sonnet-latest',
    max_tokens: 800,
    system: `${sys}\nContext: ${JSON.stringify(context)}`,
    messages: [{ role: 'user', content: String(question || '') }],
  };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `Anthropic ${resp.status}: ${JSON.stringify(pick(data, ['error', 'type', 'message']))}`
    );
  }
  const answer = data?.content?.[0]?.text || data?.output_text || '';
  return answer;
}

async function callGroq({ question, context, model }) {
  const apiKey = GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing');
  const sys =
    'You are a crypto market assistant. Answer clearly and concisely. Use the JSON context when helpful.';
  const body = {
    model: model || 'llama-3.1-70b-versatile',
    messages: [
      { role: 'system', content: `${sys}\nContext: ${JSON.stringify(context)}` },
      { role: 'user', content: String(question || '') },
    ],
    temperature: 0.2,
  };
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Groq ${resp.status}: ${JSON.stringify(pick(data, ['error']))}`);
  }
  const answer =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    data?.output_text ??
    '';
  return answer;
}

app.post('/llm', async (req, res) => {
  try {
    const { question, context, provider: providerRaw, model } = req.body || {};
    const provider = String(providerRaw || DEFAULT_PROVIDER).toLowerCase();
    let answer = '';
    if (provider === 'openai') {
      answer = await callOpenAI({ question, context, model });
    } else if (provider === 'anthropic') {
      answer = await callAnthropic({ question, context, model });
    } else if (provider === 'groq') {
      answer = await callGroq({ question, context, model });
    } else {
      // fallback to OpenAI
      answer = await callOpenAI({ question, context, model });
    }
    res.json({ answer, provider });
  } catch (e) {
    res.status(500).json({ answer: 'LLM proxy error', error: String(e?.message || e) });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, providerDefault: DEFAULT_PROVIDER });
});

app.listen(PORT, () => {
  console.log(`LLM proxy listening on http://localhost:${PORT}/llm (default: ${DEFAULT_PROVIDER})`);
});


