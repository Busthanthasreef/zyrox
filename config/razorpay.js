import Razorpay from "razorpay"

// 1. Initialize the instance using your .env variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// 2. Create the route
app.post("/create-order", async (req, res) => {
  try {
    const options = {
      amount: 500 * 100, // Amount is in paise (₹500.00)
      currency: "INR",
      receipt: "receipt_1",
    };

    const order = await razorpay.orders.create(options);
    
    // Send the order details to the frontend
    res.json(order); 
  } catch (error) {
    res.status(500).send(error);
  }
});