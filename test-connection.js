// test-connection.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables from .env file
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ Error: MONGODB_URI is not defined in your .env file.");
  process.exit(1);
}

async function testConnection() {
  try {
    console.log("⏳ Connecting to MongoDB Atlas...");
    await mongoose.connect(uri);
    
    console.log("✅ Success! Successfully connected to MongoDB.");
    console.log(`📂 Database Name: ${mongoose.connection.name}`);
    
    // Cleanly close the connection
    await mongoose.disconnect();
    console.log("🔌 Connection cleanly closed.");
  } catch (error) {
    console.error("❌ Connection failed!");
    console.error("\n--- Error Details ---");
    console.error(error.message);
    console.error("---------------------\n");
    console.log("💡 Tip: Double-check your password (and percent-encoding if it contains special characters) or check your Atlas Network Access (IP Whitelist).");
    process.exit(1);
  }
}

testConnection();