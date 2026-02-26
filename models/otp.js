import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;

const OTPSchema = new Schema({
  Code: { type: String, required: true },
  Email:{
    type:String,
    required:true
  },
  ExpiresAt: {
    type: Date,
    required: true,
    expires: 0,
  },
});

const OTP = mongoose.model("OTP", OTPSchema);

export default OTP;
