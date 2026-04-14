import mongoose from 'mongoose';


const WalletTransactionsSchema = new mongoose.Schema({
    user:{type: mongoose.Schema.Types.ObjectId,ref:'User',required:true},
    Amount: { type: Number , required: true },
    Payment_status: { type: String, required: true },
    Wallet_id: { type: mongoose.Schema.Types.ObjectId,ref:"Wallet", required: true },
    Payment_date: { type: Date, required: true },
    Payment_time: { type: Date, required: true },
    Order_id: { type: mongoose.Schema.Types.ObjectId,ref:'Order' },
    Description: { type: String, required: true },
},{timestamp: true});

const WalletTransactions = mongoose.model('WalletTransactions', WalletTransactionsSchema);

export default WalletTransactions;

