import mongoose from "mongoose";

const { Schema } = mongoose;

const productSchema = new Schema({

  productName: {
    type: String,
    required: true,
    trim: true
  },

  categoryId: {
    type: Schema.Types.ObjectId,
    ref: "Categories",
  },

  description: {
    type: String,
    required: true
  },

  productImages: [
    {
      type: String,
      required: true
    }
  ],

  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active"
  },

  IsDeleted: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

const Product = mongoose.model("Products", productSchema);

export default Product;