import VariantSchema from '../../models/variant.js';
import ProductSchema from '../../models/product.js';

const loadVariantListing = async (req, res) => {
    try {
        const { productId } = req.params;  // /admin/products/:productId/variants

        // Fetch the parent product
        const product = await ProductSchema
            .findById(productId)
            .populate('categoryId')
            .lean();

        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Fetch all variants belonging to this product
        const variants = await VariantSchema
            .find({ Product_id: productId })
            .lean();

        res.render('admin/products/variantListing', {
            product,
            variants,
            user: req.session.user
        });

    } catch (err) {
        console.error('loadVariantListing error:', err);
        res.status(500).send('Server error');
    }
};

export { loadVariantListing }