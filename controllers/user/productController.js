import productSchema from "../../models/product.js"
import categorySchema from "../../models/category.js"
const loadProducts = async (req, res) => {

    try {

        const { page, sort, brand, ram, storage, maxPrice } = req.query;

        const currentPage = parseInt(page) || 1;
        const itemsPerPage = 12;

        const filter = { isDeleted: false };

        if (brand) {
            const brands = Array.isArray(brand) ? brand : [brand];
            filter.brand = { $in: brands };
        }

        if (ram) {
            const rams = Array.isArray(ram) ? ram : [ram];
            filter.ram = { $in: rams };
        }

        if (storage) {
            const storages = Array.isArray(storage) ? storage : [storage];
            filter.storage = { $in: storages };
        }

        if (maxPrice) {
            filter.price = { $lte: parseInt(maxPrice) };
        }

        const sortMap = {
            price_asc: { price: 1 },
            price_desc: { price: -1 },
            rating: { rating: -1 },
            newest: { createdAt: -1 },
            name_asc: { Product_name: 1 },
        };

        const sortQuery = sortMap[sort] || { createdAt: -1 };

        const total = await productSchema.countDocuments(filter);
        const products= await productSchema
            .find(filter)
            .populate("Category_id")
            .populate("variants")           
            .sort(sortQuery)
            .skip((currentPage - 1) * itemsPerPage)
            .limit(itemsPerPage)
            .lean({ virtuals: true });      

        const totalPages = Math.ceil(total / itemsPerPage);
        const categories = await categorySchema.find({})
        res.render('user/products/productPage', {
            user: req.session.user,
            cartItemCount: req.session.cartCount || '0',
            products,
            currentPage,
            categories,
            totalPages,
            selectedBrands: Array.isArray(brand) ? brand : brand ? [brand] : [],
            selectedRAM: Array.isArray(ram) ? ram : ram ? [ram] : [],
            selectedStorage: Array.isArray(storage) ? storage : storage ? [storage] : [],
            maxPrice: maxPrice ? parseInt(maxPrice) : null,
            activeSort: sort,
            sortQuery: sort ? `&sort=${sort}` : '',
        });

    } catch (err) {
        console.error('loadProducts error:', err);
        res.status(500).send('Server error');
    }
};

export { loadProducts };