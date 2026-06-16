import groq from '../config/groq.js';
import buildSystemPrompt from '../prompts/systemPrompt.js';

export const chat = async (req, res) => {
  const { message, context = {} } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    const systemPrompt = buildSystemPrompt(req.user, context);

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama3-70b-8192',
      max_tokens: parseInt(process.env.GROQ_MAX_TOKENS) || 1024,
      temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content || 'No response generated.';

    return res.status(200).json({
      reply,
      model: completion.model,
      tokensUsed: completion.usage?.total_tokens,
    });
  } catch (error) {
    console.error('Groq error:', error.message);
    return res.status(503).json({
      error: 'AI service unavailable. Try again in a moment.',
    });
  }
};