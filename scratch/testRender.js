import ejs from 'ejs';
import mongoose from 'mongoose';
import Order from '../models/order.js';
import User from '../models/user.js';
import Variant from '../models/variant.js';

async function testRender() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/Zyrox');
        console.log('Connected to DB');

        const orderId = '69f62857bae6ade5002c51d8'; // Example order
        const order = await Order.findById(orderId);
        if (!order) {
            console.log('Order not found');
            return;
        }

        const user = { _id: order.userId, Name: 'Test User', Email: 'test@example.com', isAdmin: false, Profile_image: '' };

        const variantIds = order.items.map(i => i.variant).filter(Boolean);
        const variants = await Variant.find({ _id: { $in: variantIds } }, 'stock');
        const stockMap = {};
        variants.forEach(v => { stockMap[String(v._id)] = v.stock; });

        const data = {
            user: user,
            order: order,
            stockMap,
            pageTitle: 'Order Details',
            categories: [],
            cartItemCount: 0,
            wishlistCount: 0,
            currentPage: 'orders'
        };

        const html = await ejs.renderFile('./views/user/orders/orderDetails.ejs', data);
        console.log('Render Successful, length:', html.length);
        process.exit(0);
    } catch (error) {
        console.error('Render Error:', error);
        process.exit(1);
    }
}

testRender();
