import express from 'express';
import { chat, chatStream } from '../controllers/chatController.js';
import auth from '../middleware/auth.js';
import limiter from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/chat', auth, limiter, chat);
router.get('/chat/stream', auth, limiter, chatStream);
router.post('/chat/stream', auth, limiter, chatStream);

export default router;