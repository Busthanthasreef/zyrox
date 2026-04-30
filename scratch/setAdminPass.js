import mongoose from 'mongoose';
import User from '../models/user.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function setAdminPassword() {
  await mongoose.connect(process.env.MONGODB_URI);
  const hashedPassword = await bcrypt.hash('Admin@123', 10);
  const result = await User.updateOne(
    { Email: 'busthanthasreef3@gmail.com', isAdmin: true },
    { $set: { Password: hashedPassword } }
  );
  console.log('Update result:', result);
  await mongoose.disconnect();
}

setAdminPassword();
