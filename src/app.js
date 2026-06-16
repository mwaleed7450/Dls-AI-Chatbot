import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import chatRoutes from './routes/chat.js';

dotenv.config();

const app = express();

app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.static('.'));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'DLS AI Chatbot',
    message: 'Use POST /api/ai/chat or GET /api/ai/chat/stream to send messages',
    devMode: process.env.NODE_ENV === 'development' ? 'enabled (localhost auth bypass)' : 'disabled'
  });
});

// Simple auth endpoint for dev/testing
app.post('/auth/login', (req, res) => {
  const user = req.body || {};
  const token = jwt.sign(
    {
      id: user.id || 'test-user',
      name: user.name || 'Test User',
      email: user.email || 'test@example.com'
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({ token, message: 'Use this token in Authorization: Bearer <token> header' });
});

app.use('/api/ai', chatRoutes);

export default app;