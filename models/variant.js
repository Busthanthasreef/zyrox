import mongoose from "mongoose";

const { Schema } = mongoose;

const variantSchema = new Schema({

  productId: {
    type: Schema.Types.ObjectId,
    ref: "Products",
    required: true
  },
  categoryId:{
     type:Schema.Types.ObjectId,
     ref:"Categories",
     
  },

  images: [
    {
      type: String,
      required: true
    }
  ],

  color: {
    type: String,
    required: true
  },

  colorCode: {
    type: String,
    required: true
  },

  RAM: {
    type: Number,
    required: true
  },

  storage: {
    type: Number,
    required: true
  },

  SKU: {
    type: String,
    required: true,
    unique: true
  },

  price: {
    type: Number,
    required: true
  },

  stock: {
    type: Number,
    required: true
  },

  IsActive: {
    type: Boolean,
    default: true
  },

  IsDefault: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

const Variant = mongoose.model("Variant", variantSchema);

export default Variant;