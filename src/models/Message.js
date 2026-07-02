// src/models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sessionId: { 
    type: String, 
    required: true, 
    index: true // Indexed for faster queries when pulling chat history
  },
  role: { 
    type: String, 
    enum: ['user', 'assistant', 'system'], 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Message', messageSchema);