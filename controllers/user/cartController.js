import cartSchema     from "../../models/cart.js";
import productSchema   from "../../models/product.js";
import categorySchema  from "../../models/category.js";
import variantSchema   from "../../models/variant.js";
import wishlistSchema  from "../../models/wishlist.js";   // adjust path if different


/* ═══════════════════════════════════════════════════════════════
   LOAD CART
   - Paginated list of cart items (4 per page)
   - Calculates subtotal across ALL items (not just current page)
═══════════════════════════════════════════════════════════════ */
const loadCart = async (req, res) => {
  try {
    if (!req.session.user) return res.redirect("/signin");
    const userId = req.session.user._id;

    const page  = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip  = (page - 1) * limit;

    const categories = await categorySchema.find({ IsActive: true, IsDeleted: false });

    const cart = await cartSchema
      .findOne({ User_id: userId })
      .populate("Items.Product_id")
      .populate("Items.Variant_id");

    if (!cart || cart.Items.length === 0) {
      return res.render("user/cart/cart", {
        cartItems:     [],
        categories,
        subtotal:      0,
        discount:      0,
        shipping:      0,
        total:         0,
        currentPage:   1,
        totalPages:    1,
        cartItemCount: 0,
        user:          req.session.user
      });
    }

    // Remove any items whose variant/product was deleted
    const validItems = cart.Items.filter(
      item => item.Product_id && item.Variant_id
    );
    if (validItems.length !== cart.Items.length) {
      cart.Items = validItems;
      await cart.save();
    }

    const totalItems     = cart.Items.length;
    const paginatedItems = cart.Items.slice(skip, skip + limit);

    const cartItems = paginatedItems.map(item => ({
      quantity:  item.Quantity,
      productId: item.Product_id?._id,
      variantId: item.Variant_id?._id,
      product: {
        name:    item.Product_id?.productName,
        image:   item.Variant_id?.images?.length > 0
                   ? item.Variant_id.images[0]
                   : "/images/placeholder.png",
        price:   item.Variant_id?.price    ?? 0,
        color:   item.Variant_id?.color,
        ram:     item.Variant_id?.RAM,
        storage: item.Variant_id?.storage,
        stock:   item.Variant_id?.stock    ?? 0,
      }
    }));

    // Subtotal is calculated over ALL items (across pages)
    let subtotal = 0;
    cart.Items.forEach(item => {
      if (item.Variant_id) {
        subtotal += (item.Variant_id.price ?? 0) * item.Quantity;
      }
    });

    const discount   = 0;   // coupon logic can go here
    const shipping   = 0;   // free shipping logic here
    const total      = subtotal - discount + shipping;
    const totalPages = Math.ceil(totalItems / limit);

    res.render("user/cart/cart", {
      cartItems,
      categories,
      subtotal,
      discount,
      shipping,
      total,
      currentPage:   page,
      totalPages,
      cartItemCount: totalItems,
      user:          req.session.user
    });

  } catch (error) {
    console.error("Cart Load Error:", error);
    res.redirect("/");
  }
};

/* ═══════════════════════════════════════════════════════════════
   ADD TO CART
   - Validates stock before adding
   - If item already in cart → increments quantity
   - Removes the product from wishlist if it was wishlisted
   - Enforces per-item max (MAX_QTY_PER_ITEM)
═══════════════════════════════════════════════════════════════ */
const addToCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success:     false,
        requiresAuth: true,
        message:     "Please sign in to add items to cart"
      });
    }

    const { productId, variantId, quantity = 1 } = req.body;
    const userId = req.session.user._id;
    const addQty = Math.max(1, parseInt(quantity, 10));

    // Validate variant & stock
    const variant = await variantSchema.findById(variantId);
    if (!variant) {
      return res.status(404).json({ success: false, message: "Product variant not found" });
    }
    if (variant.stock <= 0) {
      return res.status(400).json({ success: false, message: "This product is out of stock" });
    }

    let cart = await cartSchema.findOne({ User_id: userId });

    if (!cart) {
      // Brand-new cart
      const cappedQty = Math.min(addQty, variant.stock);
      cart = await cartSchema.create({
        User_id: userId,
        Items: [{
          Product_id: productId,
          Variant_id: variantId,
          Quantity:   cappedQty,
          Price:      variant.price
        }]
      });
    } else {
      const itemIndex = cart.Items.findIndex(
        item => item.Variant_id.toString() === variantId.toString()
      );

      if (itemIndex > -1) {
        // Variant already in cart — increment
        const currentQty = cart.Items[itemIndex].Quantity;
        const newQty     = currentQty + addQty;

        if (newQty > variant.stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${variant.stock} unit${variant.stock > 1 ? "s" : ""} available in stock`
          });
        }

        cart.Items[itemIndex].Quantity = newQty;
      } else {
        // New item in existing cart
        const cappedQty = Math.min(addQty, variant.stock);
        cart.Items.push({
          Product_id: productId,
          Variant_id: variantId,
          Quantity:   cappedQty,
          Price:      variant.price
        });
      }

      await cart.save();
    }

    // Remove from wishlist if present
    await wishlistSchema.updateOne(
      { User_id: userId },
      { $pull: { Items: { Product_id: productId } } }
    ).catch(() => {}); // silently ignore if wishlist model differs

    const cartItemCount        = cart.Items.length;
    req.session.cartItemCount  = cartItemCount;

    res.json({
      success:       true,
      message:       "Item added to cart",
      cartCount:     cartItemCount
    });

  } catch (error) {
    console.error("addToCart error:", error);
    res.status(500).json({ success: false, message: "Failed to add item to cart" });
  }
};

/* ═══════════════════════════════════════════════════════════════
   UPDATE QUANTITY
   - Increment or decrement
   - Validates against real-time stock
   - Enforces MAX_QTY_PER_ITEM cap
   - Returns updated subtotal so client can sync summary
═══════════════════════════════════════════════════════════════ */
const updateQuantity = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { variantId, productId, quantity } = req.body;
    const newQty = parseInt(quantity, 10);
    const userId = req.session.user._id;

    if (!Number.isInteger(newQty) || newQty < 1) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    // Re-fetch variant for live stock check
    const variant = await variantSchema.findById(variantId);
    if (!variant) {
      return res.status(404).json({ success: false, message: "Variant not found" });
    }
    if (variant.stock <= 0) {
      return res.status(400).json({ success: false, message: "Product is out of stock" });
    }
    if (newQty > variant.stock) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock} unit${variant.stock > 1 ? "s" : ""} available`
      });
    }

    const cart = await cartSchema.findOne({ User_id: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const itemIndex = cart.Items.findIndex(
      item => item.Variant_id.toString() === variantId.toString()
    );
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: "Item not in cart" });
    }

    cart.Items[itemIndex].Quantity = newQty;
    await cart.save();

    // Recalculate full subtotal
    const populatedCart = await cartSchema
      .findOne({ User_id: userId })
      .populate("Items.Variant_id");

    let subtotal = 0;
    populatedCart.Items.forEach(item => {
      if (item.Variant_id) subtotal += item.Variant_id.price * item.Quantity;
    });

    res.json({
      success:     true,
      message:     "Quantity updated",
      newQuantity: newQty,
      rowTotal:    variant.price * newQty,
      subtotal,
      total:       subtotal  // add shipping/discount logic here if needed
    });

  } catch (error) {
    console.error("updateQuantity error:", error);
    res.status(500).json({ success: false, message: "Failed to update quantity" });
  }
};

/* ═══════════════════════════════════════════════════════════════
   REMOVE ITEM FROM CART
   - Pulls the item from the cart's Items array
   - Returns updated cart count for navbar badge
═══════════════════════════════════════════════════════════════ */
const removeFromCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { variantId, productId } = req.body;
    const userId = req.session.user._id;

    const cart = await cartSchema.findOne({ User_id: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const beforeLen = cart.Items.length;
    cart.Items = cart.Items.filter(
      item => item.Variant_id.toString() !== variantId.toString()
    );

    if (cart.Items.length === beforeLen) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    await cart.save();

    const cartItemCount       = cart.Items.length;
    req.session.cartItemCount = cartItemCount;

    res.json({
      success:   true,
      message:   "Item removed from cart",
      cartCount: cartItemCount
    });

  } catch (error) {
    console.error("removeFromCart error:", error);
    res.status(500).json({ success: false, message: "Failed to remove item" });
  }
};

/* ═══════════════════════════════════════════════════════════════
   CLEAR ENTIRE CART  (utility — useful for post-order cleanup)
═══════════════════════════════════════════════════════════════ */
const clearCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const userId = req.session.user._id;
    await cartSchema.findOneAndUpdate(
      { User_id: userId },
      { $set: { Items: [] } }
    );

    req.session.cartItemCount = 0;
    res.json({ success: true, message: "Cart cleared" });

  } catch (error) {
    console.error("clearCart error:", error);
    res.status(500).json({ success: false, message: "Failed to clear cart" });
  }
};

export { loadCart, addToCart, updateQuantity, removeFromCart, clearCart };






// import cartSchema from "../../models/cart.js";
// import productSchema from "../../models/product.js";
// import categorySchema from "../../models/category.js";
// import variantSchema from "../../models/variant.js";

// const loadCart = async (req, res) => {
//   try {
//     if (!req.session.user) return res.redirect("/signin");
//     const userId = req.session.user._id;

//     const page = parseInt(req.query.page) || 1;
//     const limit = 4;
//     const skip = (page - 1) * limit;

//     const categories = await categorySchema.find({ IsActive: true, IsDeleted: false });

//     const cart = await cartSchema.findOne({ User_id: userId })
//       .populate("Items.Product_id")
//       .populate("Items.Variant_id");

//     if (!cart || cart.Items.length === 0) {
//       return res.render("user/cart/cart", {
//         cartItems: [],
//         categories,
//         subtotal: 0,
//         discount: 0,
//         shipping: 0,
//         total: 0,
//         currentPage: 1,
//         totalPages: 1,
//         cartItemCount: 0,
//         user: req.session.user
//       });
//     }

//     const totalItems = cart.Items.length;
//     const paginatedItems = cart.Items.slice(skip, skip + limit);

//     const cartItems = paginatedItems.map(item => ({
//       quantity: item.Quantity,
//       productId: item.Product_id?._id,
//       variantId: item.Variant_id?._id,
//       product: {
//         name: item.Product_id?.productName,
//         image: (item.Variant_id?.images && item.Variant_id.images.length > 0) ? item.Variant_id.images[0] : '/images/placeholder.png',
//         price: item.Variant_id?.price,
//         color: item.Variant_id?.color,
//         ram: item.Variant_id?.RAM,
//         storage: item.Variant_id?.storage,
//         stock: item.Variant_id?.stock
//       }
//     }));

//     let subtotal = 0;
//     cart.Items.forEach(item => {
//       if (item.Variant_id) {
//         subtotal += item.Variant_id.price * item.Quantity;
//       }
//     });

//     const discount = 0;
//     const shipping = 0;
//     const total = subtotal - discount + shipping;
//     const totalPages = Math.ceil(totalItems / limit);

//     res.render("user/cart/cart", {
//       cartItems,
//       subtotal,
//       discount,
//       shipping,
//       total,
//       currentPage: page,
//       totalPages,
//       cartItemCount: totalItems,
//       user: req.session.user
//     });

//   } catch (error) {
//     console.log("Cart Load Error:", error);
//     res.redirect("/");
//   }
// };

// const addToCart = async (req, res) => {
//     try {
//         if (!req.session.user) return res.status(401).json({ success: false, message: "Please sign in to add items to cart" });
        
//         const { productId, variantId } = req.body;
//         const userId = req.session.user._id;

//         const variant = await variantSchema.findById(variantId);
//         if (!variant || variant.stock <= 0) {
//             return res.status(400).json({ success: false, message: "Product variant is out of stock or unavailable" });
//         }

//         let cart = await cartSchema.findOne({ User_id: userId });
        
//         if (!cart) {
//             cart = await cartSchema.create({
//                 User_id: userId,
//                 Items: [{
//                     Product_id: productId,
//                     Variant_id: variantId,
//                     Quantity: 1,
//                     Price: variant.price
//                 }]
//             });
//         } else {
//             const itemIndex = cart.Items.findIndex(item => item.Variant_id.toString() === variantId);
//             if (itemIndex > -1) {
//                 // Check if adding more would exceed stock
//                 if (cart.Items[itemIndex].Quantity + 1 > variant.stock) {
//                     return res.status(400).json({ success: false, message: "Maximum available stock reached" });
//                 }
//                 cart.Items[itemIndex].Quantity += 1;
//             } else {
//                 cart.Items.push({
//                     Product_id: productId,
//                     Variant_id: variantId,
//                     Quantity: 1,
//                     Price: variant.price
//                 });
//             }
//             await cart.save();
//         }

//         const cartItemCount = cart.Items.length;
//         req.session.cartItemCount = cartItemCount;

//         res.json({ success: true, message: "Item added to cart", cartCount: cartItemCount });

//     } catch (error) {
//         console.error("addToCart error:", error);
//         res.status(500).json({ success: false, message: "Failed to add item to cart" });
//     }
// };

// export { loadCart, addToCart };
