import cartSchema from "../../models/cart.js";
import productSchema from "../../models/product.js";
import CategorieSchema from "../../models/category.js";

const loadCart = async (req, res) => {
  try {

    const userId = req.session.userId;

    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const cart = await cartSchema.findOne({ userId }).populate("items.productId");
    const cartItemCount = await cartSchema.countDocuments()|| 3;
    const categories = await CategorieSchema.find({})

    if (!cart) {
      return res.render("user/cart/cart", {
        cartItems: [],
        categories,
        subtotal: 0,
        discount: 0,
        shipping: 0,
        total: 0,
        currentPage: 1,
        totalPages: 1,
        cartItemCount,
        user: req.session.user
      });
    }

    const totalItems = cart.items.length;

    const paginatedItems = cart.items.slice(skip, skip + limit);

    const cartItems = paginatedItems.map(item => ({
      quantity: item.quantity,
      product: {
        name: item.productId.name,
        image: item.productId.image,
        price: item.productId.price,
        color: item.productId.color,
        ram: item.productId.ram,
        storage: item.productId.storage
      }
    }));

    let subtotal = 0;

    cart.items.forEach(item => {
      subtotal += item.productId.price * item.quantity;
    });

    const discount = 0;
    const shipping = 0;
    const total = subtotal - discount + shipping;

    const totalPages = Math.ceil(totalItems / limit);

    res.render("user/cart/cart", {
      cartItems,
      subtotal,
      discount,
      shipping,
      total,
      currentPage: page,
      totalPages,
      cartItemCount: totalItems,
      user: req.session.user
    });

  } catch (error) {
    console.log("Cart Load Error:", error);
    res.redirect("/");
  }
};

export { loadCart };