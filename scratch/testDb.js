import mongoose from 'mongoose';
import User from '../models/user.js';
mongoose.connect('mongodb://127.0.0.1:27017/zyrox')
  .then(async () => {
    const user = await User.findOne({email: { $ne: null }});
    console.log('User:', user.email);
    console.log('ID:', user._id);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
