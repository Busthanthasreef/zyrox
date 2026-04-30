import bcrypt from "bcryptjs";
import { sendOtpEmail } from "../../utils/otpController.js";
import generateOtp from "../../utils/otpGenerator.js";
import userSchema from "../../models/user.js";
import otpSchema from "../../models/otp.js";

const userSignUpService = async (bodyData) => {

    const name = bodyData.name || bodyData.Name;
    const email = bodyData.email || bodyData.Email;
    const phone = bodyData.phone || bodyData.Phone;
    const password = bodyData.password || bodyData.Password;
    const referralCode = bodyData.referralCode ? bodyData.referralCode.trim().toUpperCase() : '';

    const trimmedName = name ? name.trim() : "";
    const trimmedEmail = email ? email.trim().toLowerCase() : "";
    const trimmedPhone = phone ? phone.trim() : "";
    const trimmedPassword = password ? password.trim() : "";
    const confirmPassword = bodyData.confirmPassword ? bodyData.confirmPassword.trim() : "";

    const nameRegex = /^[a-zA-Z\s]{3,50}$/;
    const emailRegex = /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z]{2,})+$/;
    const indianPhone = /^(?:\+91|91|0)?[6-9]\d{9}$/;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

    let error = {};
    let data = {};

    if (!trimmedName || !nameRegex.test(trimmedName)) {
        error = { Name: "Full name must be 3-50 characters long and contain only letters" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone, Password: trimmedPassword, confirmPassword: confirmPassword, referralCode };
        return { error, data };
    }

    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
        error = { Email: "Invalid email address" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone, Password: trimmedPassword, confirmPassword: confirmPassword, referralCode };
        return { error, data };
    }

    if (!trimmedPhone || !indianPhone.test(trimmedPhone)) {
        error = { Phone: "Enter a valid 10-digit Indian phone number" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone, Password: trimmedPassword, confirmPassword: confirmPassword, referralCode };
        return { error, data };
    }

    if (!trimmedPassword || !passwordRegex.test(trimmedPassword)) {
        error = { Password: "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character." };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone, Password: trimmedPassword, confirmPassword: confirmPassword, referralCode };
        return { error, data };
    }

    if (trimmedPassword !== confirmPassword) {
        error = { Password: "Passwords do not match" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone, Password: trimmedPassword, confirmPassword: confirmPassword, referralCode };
        return { error, data };
    }

    const existingUser = await userSchema.findOne({ Email: trimmedEmail });
    if (existingUser) {
        error = { Email: "User with this email already exists" };
        data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone, Password: trimmedPassword, confirmPassword: confirmPassword, referralCode };
        return { error, data };
    }

    // Validate Referral Code
    if (referralCode) {
        const referrer = await userSchema.findOne({ referralCode: referralCode });
        if (!referrer) {
            error = { referralError: "Invalid referral code" };
            data = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone, Password: trimmedPassword, confirmPassword: confirmPassword, referralCode };
            return { error, data };
        }
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
            referralCode,   // carry along for OTP verification step
        }
    };
};

export { userSignUpService };