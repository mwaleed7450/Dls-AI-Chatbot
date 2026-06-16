import express from 'express';
import { chat } from '../controllers/chatController.js';
import auth from '../middleware/auth.js';
import limiter from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/chat', auth, limiter, chat);

export default router;