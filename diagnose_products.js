import 'dotenv/config';
import mongoose from 'mongoose';
import Product from './models/product.js';
import Variant from './models/variant.js';

async function diagnose() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/Zyrox");
        console.log("Connected to DB");

        const variant = await Variant.findOne({});
        console.log("Variant points to Product ID:", variant.productId);

        const productMentioned = await Product.findById(variant.productId);
        if (productMentioned) {
             console.log("Product mentioned by variant exists:", {
                 id: productMentioned._id,
                 name: productMentioned.productName,
                 status: productMentioned.status,
                 isDeleted: productMentioned.IsDeleted
             });
        } else {
            console.log("Product mentioned by variant does NOT exist in Product collection!");
        }

        const allProducts = await Product.find({});
        console.log("All Products in DB:", allProducts.map(p => ({
            id: p._id,
            name: p.productName,
            isDeleted: p.IsDeleted
        })));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

diagnose();
