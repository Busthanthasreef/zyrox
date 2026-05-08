import "dotenv/config";
console.log("RAZORPAY_KEY_ID exists:", !!process.env.RAZORPAY_KEY_ID);
console.log("RAZORPAY_KEY_SECRET exists:", !!process.env.RAZORPAY_KEY_SECRET);
if (process.env.RAZORPAY_KEY_ID) {
    console.log("RAZORPAY_KEY_ID ends with space:", process.env.RAZORPAY_KEY_ID.endsWith(" "));
    console.log("RAZORPAY_KEY_ID starts with space:", process.env.RAZORPAY_KEY_ID.startsWith(" "));
    console.log("RAZORPAY_KEY_ID length:", process.env.RAZORPAY_KEY_ID.length);
}
if (process.env.RAZORPAY_KEY_SECRET) {
    console.log("RAZORPAY_KEY_SECRET length:", process.env.RAZORPAY_KEY_SECRET.length);
    console.log("RAZORPAY_KEY_SECRET starts with space:", process.env.RAZORPAY_KEY_SECRET.startsWith(" "));
    console.log("RAZORPAY_KEY_SECRET ends with space:", process.env.RAZORPAY_KEY_SECRET.endsWith(" "));
}
