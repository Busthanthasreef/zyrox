import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;

const CartSchema = new Schema({
  User_id: { type: Schema.Types.ObjectId, required: true, unique: true },
  Items: [{
     Price: { type: Number },
     Product_id: { type: Schema.Types.ObjectId, required: true },
     Quantity: { type: Number, required: true },
     Variant_id: { type: Schema.Types.ObjectId, required: true },
  }],
});

const Cart = mongoose.model('Cart', CartSchema);

export default Cart;

