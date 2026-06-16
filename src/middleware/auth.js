import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const auth = (req, res, next) => {
  // Allow localhost in development without auth
  if (process.env.NODE_ENV === 'development' && req.hostname === 'localhost') {
    req.user = {
      id: 'dev-user',
      name: 'Dev User',
      email: 'dev@localhost'
    };
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const token = req.cookies?.token || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Auth secret not configured' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export default auth;