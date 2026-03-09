import mongoose from 'mongoose';

const { Schema } = mongoose;

const WishlistSchema = new Schema({
  User_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  Products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
}, { timestamps: true });

const Wishlist = mongoose.model('Wishlist', WishlistSchema);

export default Wishlist;
