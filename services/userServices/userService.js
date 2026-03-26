import bcrypt from "bcryptjs";
import { sendOtpEmail } from "../../utils/otpController.js";
import generateOtp from "../../utils/otpGenerator.js";
import userSchema from "../../models/user.js";
import otpSchema from "../../models/otp.js";

const userSignUpService = async (bodyData) => {

    const trimmedName = bodyData.Name ? bodyData.Name.trim() : "";
    const trimmedEmail = bodyData.Email ? bodyData.Email.trim().toLowerCase() : "";
    const trimmedPhone = bodyData.Phone ? bodyData.Phone.trim() : "";
    const trimmedPassword = bodyData.Password ? bodyData.Password.trim() : "";
    const confirmPassword = bodyData.confirmPassword ? bodyData.confirmPassword.trim() : "";

    const emailRegex = /^[a-zA-Z0-9+._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const indianPhone = /^(?:\+91|91|0)?[6-9]\d{9}$/;

    let error = {};
    let data = {};

    if (!trimmedName) {
        error = { Name: "Full name is required" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone };
        return { error, data };
    }

    if (!emailRegex.test(trimmedEmail)) {
        error = { Email: "Invalid email" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone };
        return { error, data };
    }

    if (!indianPhone.test(trimmedPhone)) {
        error = { Phone: "Enter a valid 10-digit Indian phone number" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone };
        return { error, data };
    }

    if (trimmedPassword !== confirmPassword) {
        error = { Password: "Passwords do not match" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone };
        return { error, data };
    }

    const existingUser = await userSchema.findOne({ Email: trimmedEmail });

    if (existingUser) {
        error = { Email: "User with this email already exists" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone };
        return { error, data };
    }

    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);

    const { OTP, hashedOtp } = await generateOtp();

    await otpSchema.deleteMany({ Email: trimmedEmail });

    await otpSchema.create({
        Email: trimmedEmail,
        Code: hashedOtp,
        ExpiresAt: new Date(Date.now() + 3 * 60 * 1000),
    });

    await sendOtpEmail(trimmedEmail, OTP);

    return {
        tempUser: {
            Name: trimmedName,
            Email: trimmedEmail,
            Phone: trimmedPhone,
            Password: hashedPassword,
        }
    };
};

export { userSignUpService };