import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  isAdmin: { type: Boolean, required: true },
  Email: { type: String, required: true, unique: true },
  Name: { type: String, required: true },
  googleId: { type: String, unique: true, sparse: true },
  Password: {type: String,
    required:function (){
      return !this.googleId; 
    },
  },

  isActive: { type: Boolean, required: true },
  createdAt: { type: Date, required: true },
  Phone_number: { type: String },
  Profile_image: { type: String },
});

const User = mongoose.model("User", UserSchema);

export default User;
