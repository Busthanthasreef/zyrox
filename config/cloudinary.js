import { v2 as cloudinary } from "cloudinary";

const hasCloudinaryConfig =
  !!process.env.CLOUDINARY_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET;

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
} else {
  console.warn("Cloudinary credentials are not set. Image uploads will fail until configured.");
}

export default cloudinary;