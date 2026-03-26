import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;

const CartSchema = new Schema({
  User_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  User_Name:{type:String},
  Items: [{
     Price: { type: Number },
     Product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
     Quantity: { type: Number, required: true },
     Variant_id: { type: Schema.Types.ObjectId, ref: 'Variant', required: true },
  }],
});

const Cart = mongoose.model('Cart', CartSchema);

export default Cart;

