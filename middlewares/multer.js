import multer from "multer";
import cloudinary from "../config/cloudinary.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function resolveFolderName(file) {
  if (file.fieldname === "profileImage") return "zyrox/profile";
  if (
    file.fieldname === "images" ||
    file.fieldname.startsWith("variantImages") ||
    file.fieldname.startsWith("newImages")
  ) {
    return "zyrox/products";
  }
  return "zyrox-uploads";
}

function cleanPublicId(fileName) {
  return fileName
    .split(".")[0]
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-");
}

const baseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG, PNG, and WEBP files are allowed."));
    }
    cb(null, true);
  },
});

const uploadToCloudinary = async (file) => {
  if (!file?.buffer) return file;
  if (
    !process.env.CLOUDINARY_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error("Cloudinary credentials are missing. Configure CLOUDINARY_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.");
  }
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const folder = resolveFolderName(file);
  const uploadResult = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
    public_id: `${Date.now()}-${cleanPublicId(file.originalname)}`,
  });

  file.path = uploadResult.secure_url;
  file.filename = uploadResult.public_id;
  return file;
};

const cloudinaryUploadMiddleware = async (req, res, next) => {
  try {
    const filesToUpload = [];

    if (req.file) filesToUpload.push(req.file);
    if (Array.isArray(req.files)) filesToUpload.push(...req.files);
    if (req.files && typeof req.files === "object" && !Array.isArray(req.files)) {
      for (const files of Object.values(req.files)) {
        if (Array.isArray(files)) filesToUpload.push(...files);
      }
    }

    await Promise.all(filesToUpload.map(uploadToCloudinary));
    next();
  } catch (error) {
    next(error);
  }
};

const upload = {
  single: (fieldName) => [baseUpload.single(fieldName), cloudinaryUploadMiddleware],
  array: (fieldName, maxCount) => [baseUpload.array(fieldName, maxCount), cloudinaryUploadMiddleware],
  any: () => [baseUpload.any(), cloudinaryUploadMiddleware],
};

export default upload;