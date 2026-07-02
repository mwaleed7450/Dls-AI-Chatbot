/**
 * src/controllers/chatController.js
 * Request handlers for POST /api/ai/chat and POST /api/ai/chat/stream.
 * RAG-enabled with Pinecone.
 * Memory-enabled with MongoDB (Sliding window of 6 past messages).
 */

const { groqClient, GROQ_DEFAULTS } = require('../config/groq');
const { buildSystemPrompt } = require('../prompts/systemPrompt');
const { retrieveContext } = require('../services/retrieval');
const Message = require('../models/Message');

function validateBody(req, res) {
  const { message, sessionId } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: '"message" is required and must be a non-empty string.' });
    return null;
  }

  if (message.length > 4000) {
    res.status(400).json({ error: '"message" is too long (max 4000 characters).' });
    return null;
  }

  const context = (req.body && typeof req.body.context === 'object' && req.body.context) || {};
  
  // Fallback to a default session if the frontend fails to provide one
  const validSessionId = (typeof sessionId === 'string' && sessionId.trim()) ? sessionId.trim() : 'anonymous-session';

  return { message: message.trim(), context, sessionId: validSessionId };
}

/**
 * Builds the final system prompt, injecting retrieved book context if available.
 */
async function buildRAGPrompt({ user, context, message }) {
  const systemPrompt = buildSystemPrompt({ user, context });
  const bookContext = await retrieveContext(message); // RAG search using ONLY the new message

  if (!bookContext) {
    return systemPrompt; 
  }

  return `${systemPrompt}

---
RELEVANT CURRICULUM CONTENT (retrieved from DLD/DLS books):
Use the following excerpts to answer the student's question accurately.
If the answer is directly in the content below, prioritize it over general knowledge.

${bookContext}
---`;
}

/**
 * Helper to fetch and format the last 6 messages for the Groq payload.
 */
async function getChatHistory(sessionId) {
  try {
    const rawHistory = await Message.find({ sessionId })
      .sort({ timestamp: -1 })
      .limit(6);
    
    rawHistory.reverse(); // Chronological order
    return rawHistory.map(msg => ({ role: msg.role, content: msg.content }));
  } catch (err) {
    console.error('[chatController.getChatHistory] Database read failed:', err);
    return []; // Fail gracefully, return empty history rather than crashing
  }
}

/**
 * Helper to save user and assistant messages to MongoDB asynchronously.
 */
function saveInteractions(sessionId, userMessage, assistantReply) {
  if (!assistantReply) return;
  Message.create({ sessionId, role: 'user', content: userMessage }).catch(err => console.error('DB Save Error (User):', err));
  Message.create({ sessionId, role: 'assistant', content: assistantReply }).catch(err => console.error('DB Save Error (Assistant):', err));
}

/**
 * POST /api/ai/chat
 * Standard, non-streaming completion with RAG and Memory.
 */
async function handleChat(req, res) {
  const validated = validateBody(req, res);
  if (!validated) return;

  const { message, context, sessionId } = validated;
  
  try {
    // 1. Fetch data in parallel to reduce latency
    const [systemPrompt, history] = await Promise.all([
      buildRAGPrompt({ user: req.user, context, message }),
      getChatHistory(sessionId)
    ]);

    // 2. Assemble payload
    const completion = await groqClient.chat.completions.create({
      model: GROQ_DEFAULTS.model,
      max_tokens: GROQ_DEFAULTS.maxTokens,
      temperature: GROQ_DEFAULTS.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
    });

    const reply = completion?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: 'Received an empty response from the AI provider.' });
    }

    // 3. Save to database asynchronously
    saveInteractions(sessionId, message, reply);

    return res.status(200).json({
      reply,
      model: GROQ_DEFAULTS.model,
      tokensUsed: completion?.usage?.total_tokens ?? null,
    });
  } catch (err) {
    console.error('[chatController.handleChat] Groq request failed:', err?.message || err);
    return res.status(503).json({ error: 'The AI assistant is temporarily unavailable.' });
  }
}

/**
 * POST /api/ai/chat/stream
 * Streaming SSE completion with RAG and Memory.
 */
async function handleChatStream(req, res) {
  const validated = validateBody(req, res);
  if (!validated) return;

  const { message, context, sessionId } = validated;
  
  try {
    const [systemPrompt, history] = await Promise.all([
      buildRAGPrompt({ user: req.user, context, message }),
      getChatHistory(sessionId)
    ]);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    let closed = false;
    req.on('close', () => { closed = true; });

    const stream = await groqClient.chat.completions.create({
      model: GROQ_DEFAULTS.model,
      max_tokens: GROQ_DEFAULTS.maxTokens,
      temperature: GROQ_DEFAULTS.temperature,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
    });

    let fullReply = ""; // Aggregator for the database

    for await (const chunk of stream) {
      if (closed) break;
      const token = chunk?.choices?.[0]?.delta?.content;
      if (token) {
        fullReply += token;
        sendEvent({ token });
      }
    }

    if (!closed) {
      sendEvent({ done: true });
      res.end();
      // Save the aggregated stream string to the database
      saveInteractions(sessionId, message, fullReply.trim());
    }
  } catch (err) {
    console.error('[chatController.handleChatStream] Groq stream failed:', err?.message || err);
    if (!res.headersSent) {
        // Fallback error if headers haven't been written yet
        res.status(503).json({ error: 'The AI assistant is temporarily unavailable.' });
    } else if (!closed) {
      sendEvent({ error: 'The AI assistant is temporarily unavailable.' });
      res.end();
    }
  }
}

module.exports = {
  handleChat,
  handleChatStream,
};