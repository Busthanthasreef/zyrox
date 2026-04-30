import mongoose from 'mongoose';
import User from '../models/user.js';
import dotenv from 'dotenv';
dotenv.config();

async function findAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);
  const admin = await User.findOne({ isAdmin: true });
  if (admin) {
    console.log('Admin found:', admin.Email);
  } else {
    console.log('No admin found. Creating one...');
    // If no admin, I could create one, but I need to know the password hashing.
    // adminController uses bcrypt.
  }
  await mongoose.disconnect();
}

findAdmin();
