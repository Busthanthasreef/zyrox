import mongoose from 'mongoose';



const WalletSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  balance: { type: Number, required: true,default:0 },
});

const Wallet = mongoose.model('Wallet', WalletSchema);

export default Wallet;

