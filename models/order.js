import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        variant: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Variant",
          required: true,
        },
        name: String,
        image: String,
        quantity: {
          type: Number,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        total: {
          type: Number,
          required: true,
        },
        color: String,
        storage: Number,
        RAM: Number,
      },
    ],
    shippingAddress: {
      fullName: String,
      phone: String,
      houseName: String,
      locality: String,
      city: String,
      state: String,
      pincode: String,
      type: Object
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["COD", "Online", "Wallet"],
    },
    paymentStatus: {
      type: String,
      required: true,
      default: "Pending",
      enum: ["Pending", "Paid", "Failed", "Refunded"],
    },
    orderStatus: {
      type: String,
      required: true,
      default: "Order Placed",
      enum: [
        "Order Placed",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Returned",
      ],
    },
    subtotal: Number,
    discount: {
      type: Number,
      default: 0,
    },
    couponDiscount: {
      type: Number,
      default: 0,
    },
    couponCode: String,
    shippingCharge: {
      type: Number,
      default: 0,
    },
    finalPrice: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
