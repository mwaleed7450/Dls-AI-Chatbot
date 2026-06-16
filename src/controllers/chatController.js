import groq from '../config/groq.js';
import buildSystemPrompt from '../prompts/systemPrompt.js';

const parseContext = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (typeof value === 'object') {
    return value;
  }

  return {};
};

const getRequestData = (req) => {
  if (req.method === 'GET') {
    return {
      message: req.query.message,
      context: parseContext(req.query.context),
    };
  }

  return {
    message: req.body?.message,
    context: req.body?.context || {},
  };
};

const createCompletion = async ({ user, context, message, stream = false }) => {
  const systemPrompt = buildSystemPrompt(user, context);

  return groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama3-70b-8192',
    max_tokens: parseInt(process.env.GROQ_MAX_TOKENS) || 1024,
    temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.5,
    stream,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ],
  });
};

export const chat = async (req, res) => {
  const { message, context = {} } = getRequestData(req);

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    const completion = await createCompletion({ user: req.user, context, message });

    const reply = completion.choices[0]?.message?.content || 'No response generated.';

    return res.status(200).json({
      reply,
      model: completion.model,
      tokensUsed: completion.usage?.total_tokens,
    });
  } catch (error) {
    console.error('Groq error:', error.message);
    console.error('Full error:', error);
    return res.status(503).json({
      error: 'AI service unavailable. Try again in a moment.',
      details: error.message
    });
  }
};

export const chatStream = async (req, res) => {
  const { message, context = {} } = getRequestData(req);

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const completion = await createCompletion({ user: req.user, context, message, stream: true });
    let reply = '';

    for await (const chunk of completion) {
      const token = chunk.choices?.[0]?.delta?.content;

      if (token) {
        reply += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }

    res.write(`event: done\ndata: ${JSON.stringify({ reply })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Groq stream error:', error.message);
    console.error('Full error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'AI service unavailable. Try again in a moment.', details: error.message })}\n\n`);
    res.end();
  }
};