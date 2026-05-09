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
        status: {
          type: String,
          default: "Pending",
          enum: [
            "Pending",
            "Processing",
            "Shipped",
            "Delivered",
            "Cancelled",
            "Returned",
            "Return Requested",
            "Cancellation Requested"
          ],
        },
        cancellationReason: { type: String, default: null },
        returnReason: { type: String, default: null },
        deliveredAt: { type: Date, default: null },
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
      enum: ["Pending", "Paid", "Failed", "Refunded", "Payment Cancelled"],
    },
    orderStatus: {
      type: String,
      required: true,
      default: "Pending",
      enum: [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Returned",
        "Return Requested",
        "Cancellation Requested",
        "Failed",
      ],
    },
    paymentFailureReason: {
      type: String,
      default: null,
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
    cancellationReason: {
      type: String,
      default: null,
    },
    returnReason: {
      type: String,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
