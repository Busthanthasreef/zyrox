import bcrypt from "bcryptjs";

const generateOtp = async () => {
  const OTP = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(OTP, 10);
  
  // Minimal log here; full log with email is in otpController.js
  console.log(`[OTP GENERATED: ${OTP}]`);
  
  return { OTP, hashedOtp }; 
};

export default generateOtp;