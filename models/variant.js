import mongoose from 'mongoose';
const { Schema, ObjectId } = mongoose;

const VariantsSchema = new Schema({
  Images: [{ type: String, required: true,  }],
  Color: { type: String, required: true },
  ColorCode: { type: String, required: true },
  Storage: { type: Number, required: true },
  SKU: { type: String, required: true, unique: true },
  IsActive: { type: Boolean, required: true },
  RAM: { type: Number, required: true },
  Product_id: { type: Schema.Types.ObjectId, required: true, unique: true },
  IsDefault: { type: Boolean, required: true },
  Price: { type:Number, required: true },
  Stock: { type: Number, required: true },
});


const Variants = mongoose.model('Variants', VariantsSchema);

export default Variants;

