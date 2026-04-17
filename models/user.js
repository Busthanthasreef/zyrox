import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  isAdmin: { type: Boolean, required: true },
  Email: { type: String, required: true, unique: true },
  Name: { type: String, required: true },
  googleId: { type: String, unique: true, sparse: true },
  Password: {
    type: String,
    required: function () {
      return !this.googleId;
    },
  },

  isActive: { type: Boolean, required: true },
  createdAt: { type: Date, required: true },
  Phone_number: { type: String },
  Profile_image: { type: String, default: "https://ui-avatars.com/api/?name=User&background=random&size=200" },
  
  // Referral System
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  referredUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  referralRewards: {
    type: Number,
    default: 0
  }
});

const User = mongoose.model("User", UserSchema);

export default User;
