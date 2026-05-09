import nodemailer from "nodemailer";

/**
 * Sends an order confirmation email to the user.
 * 
 * @param {string} email - Recipient email address
 * @param {object} order - The order document/object
 */
export const sendOrderConfirmationEmail = async (email, order) => {
    try {
        const appPassword = process.env.PASS.replace(/\s+/g, "");

        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL,
                pass: appPassword,
            },
        });

        const itemsHtml = order.items.map(item => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    <strong>${item.name}</strong><br/>
                    <small>Qty: ${item.quantity} | Price: ₹${item.price.toLocaleString('en-IN')}</small>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
                    ₹${(item.price * item.quantity).toLocaleString('en-IN')}
                </td>
            </tr>
        `).join('');

        const orderDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        const htmlContent = `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
            <div style="background: #0d0f14; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: #fff; margin: 0; font-size: 28px; letter-spacing: 2px;">ZYROX</h1>
                <p style="color: #4f6ef7; margin: 10px 0 0; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Order Confirmed</p>
            </div>
            
            <div style="padding: 30px; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px;">
                <h2 style="color: #0d0f14;">High five!</h2>
                <p>Hello <strong>${order.shippingAddress.fullName}</strong>,</p>
                <p>Your order <strong>#${order.orderId}</strong> has been successfully placed and is now being prepared. We'll notify you when it's on its way.</p>
                
                <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 25px 0;">
                    <h3 style="margin-top: 0; color: #0d0f14; border-bottom: 2px solid #eee; padding-bottom: 10px;">Order Summary</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="text-align: left; padding: 10px; color: #666; font-size: 12px; text-transform: uppercase;">Product</th>
                                <th style="text-align: right; padding: 10px; color: #666; font-size: 12px; text-transform: uppercase;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td style="padding: 10px; font-weight: bold;">Final Amount</td>
                                <td style="padding: 10px; text-align: right; font-weight: bold; color: #4f6ef7; font-size: 18px;">
                                    ₹${order.finalPrice.toLocaleString('en-IN')}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div style="margin-bottom: 25px;">
                    <h4 style="margin-bottom: 5px; color: #0d0f14;">Shipping To:</h4>
                    <p style="margin: 0; color: #666;">
                        ${order.shippingAddress.houseName}, ${order.shippingAddress.locality}<br/>
                        ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}
                    </p>
                </div>

                <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 13px; color: #888;">
                    <p style="margin: 0;">Order Date: ${orderDate}</p>
                    <p style="margin: 5px 0 0;">Payment Method: ${order.paymentMethod}</p>
                </div>
            </div>
            
            <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                <p>&copy; ${new Date().getFullYear()} Zyrox eCommerce. All rights reserved.</p>
            </div>
        </div>
        `;

        await transporter.sendMail({
            from: `"Zyrox" <${process.env.EMAIL}>`,
            to: email,
            subject: `Order Confirmed: #${order.orderId} - Zyrox`,
            html: htmlContent,
        });

        console.log(`[Email] Order confirmation sent to ${email} for #${order.orderId}`);
    } catch (error) {
        console.error("[Email] Failed to send order confirmation:", error);
        // We don't throw here to avoid failing the order placement process just because of an email error
    }
};
