import mongoose from 'mongoose';
import userSchema from '../models/user.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.DB_URI || 'mongodb://localhost:27017/zyrox');
        const user = await userSchema.findOne({ Email: 'busthanthasreef3@gmail.com' });
        console.log(user ? JSON.stringify(user, null, 2) : 'User not found');
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
check();
