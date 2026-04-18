import mongoose from "mongoose";

const connectDB = async () => {
    try {
        const mongoURI = "mongodb://127.0.0.1:27017/Zyrox";
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