import VariantSchema from '../../models/variant.js';
import ProductSchema from '../../models/product.js';
import categorySchema from '../../models/category.js';

const loadVariantListing = async (req, res) => {
    try {
        const { id } = req.params;
        const productId= id;
console.log(id)
        // Fetch the parent product
        const product = await ProductSchema.findById(id)
        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Fetch all variants belonging to this product
        const variants = await VariantSchema.find( {productId}).lean();
        const totalVariants = await VariantSchema.find({productId}).countDocuments();
        const activeVariants = await VariantSchema.find({IsActive:true}).countDocuments();
        const inactiveVariants = await VariantSchema.find({IsActive:false}).countDocuments();
        const categories = await categorySchema.find();
        res.render('admin/products/variantListing', {
            product,
            variants,
            categories,
            totalVariants,
            activeVariants,
            inactiveVariants,
            user: req.session.user
        });

    } catch (err) {
        console.error('loadVariantListing error:', err);
        res.status(500).send('Server error');
    }
};


const addVariant= async(req,res)=>{
    const {color,storage,ram,stock,price,sku,status}=req.body
    console.log(color)
}
export { loadVariantListing,addVariant }