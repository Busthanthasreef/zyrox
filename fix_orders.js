import mongoose from 'mongoose';
import Order from './models/order.js';

import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Fix Returned
    const returnedOrders = await Order.find({ orderStatus: 'Returned' });
    for (let order of returnedOrders) {
      let changed = false;
      order.items.forEach(item => {
        if (item.status !== 'Returned') {
          item.status = 'Returned';
          changed = true;
        }
      });
      if (changed) {
        await order.save();
        console.log(`Fixed order ${order.orderId} - set all items to Returned`);
      }
    }

    // Fix Return Requested just in case
    const returnReqOrders = await Order.find({ orderStatus: 'Return Requested' });
    for (let order of returnReqOrders) {
      let changed = false;
      order.items.forEach(item => {
        if (item.status !== 'Return Requested') {
          item.status = 'Return Requested';
          changed = true;
        }
      });
      if (changed) {
        await order.save();
        console.log(`Fixed order ${order.orderId} - set all items to Return Requested`);
      }
    }

    console.log('Done');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
