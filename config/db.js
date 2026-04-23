import mongoose from "mongoose";

const connectDB = async () => {
    try {
        const isProduction = process.env.NODE_ENV === "production";
        const mongoURI = process.env.MONGODB_URI || (isProduction ? "" : "mongodb://127.0.0.1:27017/Zyrox");
        if (!mongoURI) throw new Error("MONGODB_URI is required in production.");
        if (!process.env.MONGODB_URI && !isProduction) {
            console.warn("MONGODB_URI is not set. Using local MongoDB URI for development.");
        }
        await mongoose.connect(mongoURI);
        console.log(" Database Connected successfully✅");
    }
    catch(error) {
        console.error(" Database connection failed❌");
        console.error(`Reason: ${error}`);
        process.exit(1);
    }
}

export default connectDB;