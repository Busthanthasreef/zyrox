import fs from 'fs';
import ejs from 'ejs';
import path from 'path';

try {
    const templatePath = path.join(process.cwd(), 'views/admin/orders/orderDetails.ejs');
    const template = fs.readFileSync(templatePath, 'utf-8');
    const fn = ejs.compile(template, { filename: templatePath });
    
    const mockData = {
        admin: { Name: 'Admin' },
        order: {
            _id: '123',
            orderId: 'ORD123',
            orderStatus: 'Pending',
            createdAt: new Date(),
            userId: { _id: 'user123', toString: () => "user123" },
            items: [
                {
                    _id: 'item1',
                    name: 'Phone',
                    image: 'img.jpg',
                    RAM: 8,
                    storage: 128,
                    color: 'Black',
                    total: 1000,
                    quantity: 1,
                    status: 'Pending'
                }
            ],
            shippingAddress: {
                fullName: 'John',
                city: 'NY',
                state: 'NY',
                houseName: 'Apt 1',
                locality: 'Downtown',
                pincode: '10001'
            },
            paymentMethod: 'Online',
            subtotal: 1000,
            discount: 0,
            finalPrice: 1000
        },
        currentPage: 'orders'
    };

    const output = fn(mockData);
    console.log("Render successful!");
} catch (e) {
    console.log("RENDER ERROR:");
    console.log(e.message);
    console.log(e.stack);
}
