import Order from "../../models/order.js";
import moment from "moment";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const getFilterDates = (filterType, customStart, customEnd) => {
    let startDate = null;
    let endDate = null;
    
    if (filterType === 'daily') {
        startDate = moment().startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
    } else if (filterType === 'weekly') {
        startDate = moment().subtract(6, 'days').startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
    } else if (filterType === 'monthly') {
        startDate = moment().startOf('month').toDate();
        endDate = moment().endOf('month').toDate();
    } else if (filterType === 'yearly') {
        startDate = moment().startOf('year').toDate();
        endDate = moment().endOf('year').toDate();
    } else if (filterType === 'custom') {
        if (customStart && customEnd) {
            startDate = moment(customStart).startOf('day').toDate();
            endDate = moment(customEnd).endOf('day').toDate();
        } else {
            startDate = moment().startOf('day').toDate();
            endDate = moment().endOf('day').toDate();
        }
    } else {
        // default to all time loosely
         startDate = new Date(0);
         endDate = new Date();
    }
    
    return { startDate, endDate };
};

const getSalesData = async (startDate, endDate) => {
    const query = {
        orderStatus: "Delivered",
        createdAt: {
            $gte: startDate,
            $lte: endDate
        }
    };
    
    const orders = await Order.find(query).populate('userId').sort({ createdAt: -1 });
    
    let totalSalesAmount = 0;
    let totalDiscounts = 0;
    
    orders.forEach(order => {
        totalSalesAmount += (order.finalPrice || 0);
        totalDiscounts += (order.discount || 0) + (order.couponDiscount || 0);
    });
    
    return {
        orders,
        totalSalesAmount,
        totalDiscounts,
        totalOrders: orders.length
    };
};

export const getSalesReport = async (req, res) => {
    try {
        const filterType = req.query.filterType || 'daily';
        const customStart = req.query.startDate;
        const customEnd = req.query.endDate;
        
        const { startDate, endDate } = getFilterDates(filterType, customStart, customEnd);
        const data = await getSalesData(startDate, endDate);
        
        res.render("admin/salesReport/index", {
            currentUser: req.session.admin || { Name: 'Admin', Email: 'admin@zyrox.com' },
            data,
            filterType,
            customStart,
            customEnd
        });
    } catch (error) {
        console.error("Error generating sales report:", error);
        res.status(500).send("Server Error");
    }
};

export const exportExcel = async (req, res) => {
    try {
        const { filterType, startDate: customStart, endDate: customEnd } = req.query;
        const { startDate, endDate } = getFilterDates(filterType, customStart, customEnd);
        const data = await getSalesData(startDate, endDate);
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');
        
        worksheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 20 },
            { header: 'Date', key: 'date', width: 20 },
            { header: 'Customer', key: 'customer', width: 25 },
            { header: 'Items Amount', key: 'amount', width: 15 },
            { header: 'Discount', key: 'discount', width: 15 },
            { header: 'Final Amount (Rs)', key: 'finalPrice', width: 20 },
            { header: 'Payment Method', key: 'payment', width: 15 }
        ];
        
        data.orders.forEach(order => {
            worksheet.addRow({
                orderId: order.orderId,
                date: moment(order.createdAt).format('YYYY-MM-DD HH:mm'),
                customer: order.userId ? order.userId.Name || order.userId.Email : 'Guest',
                amount: order.subtotal || 0,
                discount: (order.discount || 0) + (order.couponDiscount || 0),
                finalPrice: order.finalPrice || 0,
                payment: order.paymentMethod || 'N/A'
            });
        });
        
        worksheet.addRow([]);
        worksheet.addRow(['Total Orders', data.totalOrders]);
        worksheet.addRow(['Total Sales', '', '', '', '', data.totalSalesAmount]);
        worksheet.addRow(['Total Discount', '', '', '', data.totalDiscounts]);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Zyrox_Sales_Report.xlsx');
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Export Excel error", error);
        res.status(500).send("Failed to export Excel");
    }
};

export const exportPDF = async (req, res) => {
    try {
        const { filterType, startDate: customStart, endDate: customEnd } = req.query;
        const { startDate, endDate } = getFilterDates(filterType, customStart, customEnd);
        const data = await getSalesData(startDate, endDate);
        
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Zyrox_Sales_Report.pdf');
        
        doc.pipe(res);
        
        // Header
        doc.fontSize(20).text('Zyrox - Sales Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Period: ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`, { align: 'center' });
        doc.moveDown(2);
        
        // Summary
        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(12).text(`Total Orders: ${data.totalOrders}`);
        doc.text(`Total Sales: Rs. ${data.totalSalesAmount.toLocaleString()}`);
        doc.text(`Total Discount: Rs. ${data.totalDiscounts.toLocaleString()}`);
        doc.moveDown(2);
        
        // Table Header
        const tableTop = 250;
        let y = tableTop;
        
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Order ID', 30, y);
        doc.text('Date', 120, y);
        doc.text('Customer', 210, y);
        doc.text('Discount', 340, y);
        doc.text('Total', 420, y);
        doc.text('Payment', 480, y);
        
        y += 20;
        doc.moveTo(30, y - 5).lineTo(560, y - 5).stroke();
        
        doc.font('Helvetica');
        // Table Rows
        data.orders.forEach((order, i) => {
            if (y > 750) {
                doc.addPage();
                y = 50;
            }
            doc.text(order.orderId.substring(0, 10), 30, y);
            doc.text(moment(order.createdAt).format('MM-DD-YYYY'), 120, y);
            
            const custName = order.userId ? (order.userId.Name || 'User').substring(0, 15) : 'N/A';
            doc.text(custName, 210, y);
            
            const disc = (order.discount || 0) + (order.couponDiscount || 0);
            doc.text(disc.toString(), 340, y);
            
            doc.text(order.finalPrice ? order.finalPrice.toString() : '0', 420, y);
            doc.text(order.paymentMethod, 480, y);
            
            y += 20;
        });
        
        doc.end();
    } catch (error) {
        console.error("Export PDF error", error);
        res.status(500).send("Failed to export PDF");
    }
};
