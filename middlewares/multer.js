import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer Storage for Cloudinary (V4+ API)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folderName = "zyrox-uploads";

    if (file.fieldname === "profileImage") {
      folderName = "zyrox/profile";
    } else if (
      file.fieldname === "images" || 
      file.fieldname.startsWith("variantImages") || 
      file.fieldname.startsWith("newImages")
    ) {
      folderName = "zyrox/products";
    }

    const cleanFileName = file.originalname.split(".")[0].replace(/\s+/g, "-");

    return {
      folder: folderName,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      public_id: `${Date.now()}-${cleanFileName}`,
    };
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export default upload;