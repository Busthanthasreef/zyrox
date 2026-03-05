import mongoose from 'mongoose';

const { Schema } = mongoose;

const ProductsSchema = new Schema({
  Product_name:    { type: String, required: true },
  Category_id:     { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  Product_images:  [{ type: String, required: true }],
  status:          { type: String, enum: ['active', 'inactive'], default: 'active' },
  Description:     { type: String, required: true },
}, { timestamps: true });

const Products = mongoose.model('Products', ProductsSchema);

export default Products;