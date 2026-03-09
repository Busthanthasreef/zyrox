import Wishlist from "../../models/wishlist.js";

const toggleWishlist = async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ success: false, message: "Please sign in" });

        const userId = req.session.user._id;
        const { productId } = req.body;

        let wishlist = await Wishlist.findOne({ User_id: userId });

        if (!wishlist) {
            wishlist = await Wishlist.create({
                User_id: userId,
                Products: [productId]
            });
            return res.json({ success: true, action: 'added' });
        }

        const productIndex = wishlist.Products.indexOf(productId);
        if (productIndex > -1) {
            wishlist.Products.splice(productIndex, 1);
            await wishlist.save();
            return res.json({ success: true, action: 'removed' });
        } else {
            wishlist.Products.push(productId);
            await wishlist.save();
            return res.json({ success: true, action: 'added' });
        }

    } catch (error) {
        console.error("toggleWishlist error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const loadWishlist = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect("/signin");
        const userId = req.session.user._id;

        const wishlist = await Wishlist.findOne({ User_id: userId }).populate("Products");
        
        res.render("user/wishlist/wishlist", {
            user: req.session.user,
            wishlist: wishlist ? wishlist.Products : [],
            cartItemCount: req.session.cartItemCount || 0
        });
    } catch (error) {
        console.error("loadWishlist error:", error);
        res.redirect("/");
    }
};

export { toggleWishlist, loadWishlist };
