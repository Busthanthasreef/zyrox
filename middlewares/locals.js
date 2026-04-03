import Wishlist from "../models/wishlist.js";
import Cart from "../models/cart.js";

/**
 * Global middleware that injects wishlistCount and cartItemCount
 * into res.locals so every view (via the navbar partial) can access them
 * without each controller needing to pass them explicitly.
 */
const attachLocalCounts = async (req, res, next) => {
    const userId = req.session?.user?._id;

    if (!userId) {
        res.locals.wishlistCount = 0;
        // Don't override cartItemCount if controller already sets it
        if (res.locals.cartItemCount === undefined) {
            res.locals.cartItemCount = 0;
        }
        return next();
    }

    try {
        const [wishlist, cart] = await Promise.all([
            Wishlist.findOne({ User_id: userId }).select("Products").lean(),
            Cart.findOne({ User_id: userId }).select("Items").lean()
        ]);

        res.locals.wishlistCount = wishlist?.Products?.length ?? 0;

        // Only set cartItemCount globally if the controller hasn't set it
        if (res.locals.cartItemCount === undefined) {
            res.locals.cartItemCount = cart?.Items?.length ?? 0;
        }
    } catch {
        res.locals.wishlistCount = 0;
        if (res.locals.cartItemCount === undefined) {
            res.locals.cartItemCount = 0;
        }
    }

    next();
};

export default attachLocalCounts;
