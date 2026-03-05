import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;
const CategoriesSchema = new Schema({
  categoryName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  IsActive: {
    type: Boolean,
    default: true
  },
  IsDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const Categories = mongoose.model('Categories', CategoriesSchema);

export default Categories;

