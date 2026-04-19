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
         startDate = new Date(0);
         endDate = new Date();
    }
    
    return { startDate, endDate };
};

const getSalesData = async (startDate, endDate, page = 1, limit = 10) => {
    const query = {
        orderStatus: { $nin: ["Cancelled", "Returned", "Cancellation Requested", "Return Requested"] },
        paymentStatus: { $ne: "Failed" },
        createdAt: {
            $gte: startDate,
            $lte: endDate
        }
    };
    
    const totalsData = await Order.aggregate([
        { $match: query },
        { 
            $group: { 
                _id: null, 
                totalSales: { $sum: "$finalPrice" },
                totalDiscount: { $sum: "$discount" },
                count: { $sum: 1 }
            } 
        }
    ]);

    const productsSoldAggr = await Order.aggregate([
        { $match: query },
        { $unwind: "$items" },
        { $group: { _id: null, total: { $sum: "$items.quantity" } } }
    ]);

    const totals = totalsData[0] || { totalSales: 0, totalDiscount: 0, count: 0 };
    const totalProductsSold = productsSoldAggr[0] ? productsSoldAggr[0].total : 0;

    // 1. Chart Data for selected period (Daily/Monthly)
    const diffDays = moment(endDate).diff(moment(startDate), 'days');
    const groupFormat = diffDays > 31 ? "%Y-%m" : "%Y-%m-%d";
    
    const chartAggr = await Order.aggregate([
        { $match: query },
        { $group: { _id: { $dateToString: { format: groupFormat, date: "$createdAt" } }, total: { $sum: "$finalPrice" } } },
        { $sort: { _id: 1 } }
    ]);

    // 2. Yearly Chart Data (Monthly for current year)
    const startOfYear = moment().startOf('year').toDate();
    const endOfYear = moment().endOf('year').toDate();
    const yearlyAggr = await Order.aggregate([
        { $match: { 
            orderStatus: { $nin: ["Cancelled", "Returned", "Cancellation Requested", "Return Requested"] },
            paymentStatus: { $ne: "Failed" },
            createdAt: { $gte: startOfYear, $lte: endOfYear }
        } },
        { $group: { _id: { $month: "$createdAt" }, total: { $sum: "$finalPrice" } } },
        { $sort: { _id: 1 } }
    ]);

    const yearlyData = Array(12).fill(0);
    yearlyAggr.forEach(item => {
        yearlyData[item._id - 1] = item.total;
    });

    const skip = (page - 1) * limit;
    const orders = await Order.find(query)
        .populate('userId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    
    return {
        orders,
        totalSalesAmount: totals.totalSales,
        totalDiscounts: totals.totalDiscount,
        totalOrders: totals.count,
        totalProductsSold,
        currentPage: page,
        totalPages: Math.ceil(totals.count / limit),
        chartData: {
            labels: chartAggr.map(c => c._id),
            values: chartAggr.map(c => c.total)
        },
        yearlyChartData: yearlyData
    };
};

export const getSalesReport = async (req, res) => {
    try {
        const filterType = req.query.filterType || 'daily';
        const customStart = req.query.startDate;
        const customEnd = req.query.endDate;
        const page = parseInt(req.query.page) || 1;
        
        const { startDate, endDate } = getFilterDates(filterType, customStart, customEnd);
        const data = await getSalesData(startDate, endDate, page, 5);
        
        res.render("admin/salesReport/index", {
            currentUser: req.session.admin,
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
        const data = await getSalesData(startDate, endDate, 1, 1000000);
        
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
                discount: order.discount || 0,
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
        const data = await getSalesData(startDate, endDate, 1, 1000000);
        
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const filename = `Zyrox_Sales_Report_${moment().format('YYYYMMDD')}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        
        doc.pipe(res);

        // --- Branded Header Section ---
        doc.rect(0, 0, 612, 110).fill('#1e293b'); 
        
        doc.fillColor('#ffffff')
           .fontSize(26)
           .font('Helvetica-Bold')
           .text('ZYROX', 40, 40);
        
        doc.fontSize(10)
           .font('Helvetica')
           .text('ADMINISTRATIVE SALES REPORT', 40, 72);
           
        doc.fontSize(9)
           .text(`Date: ${moment().format('MMMM Do YYYY, h:mm a')}`, 400, 45, { align: 'right', width: 160 });
        
        doc.fontSize(9)
           .text(`Period: ${moment(startDate).format('DD MMM YYYY')} - ${moment(endDate).format('DD MMM YYYY')}`, 400, 60, { align: 'right', width: 160 });

        // --- KPI Summary Highlight ---
        const summaryY = 140;
        const cardWidth = 165;
        const cardHeight = 65;
        
        // Orders Summary
        doc.rect(40, summaryY, cardWidth, cardHeight).fill('#f8fafc');
        doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('TOTAL TRANSACTIONS', 50, summaryY + 18);
        doc.fillColor('#1e293b').fontSize(18).text(data.totalOrders.toString(), 50, summaryY + 35);
        
        // Revenue Summary
        doc.rect(215, summaryY, cardWidth, cardHeight).fill('#f8fafc');
        doc.fillColor('#64748b').fontSize(8).text('GROSS SALES AMOUNT', 225, summaryY + 18);
        doc.fillColor('#3b82f6').fontSize(18).text(`₹${data.totalSalesAmount.toLocaleString()}`, 225, summaryY + 35);
        
        // Discount Summary
        doc.rect(390, summaryY, cardWidth, cardHeight).fill('#f8fafc');
        doc.fillColor('#64748b').fontSize(8).text('TOTAL DEDUCTIONS', 400, summaryY + 18);
        doc.fillColor('#ef4444').fontSize(18).text(`₹${data.totalDiscounts.toLocaleString()}`, 400, summaryY + 35);

        // --- Data Table Header ---
        const tableTop = 235;
        doc.rect(40, tableTop, 515, 28).fill('#334155');
        
        doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
        doc.text('ID', 50, tableTop + 10);
        doc.text('DATE', 110, tableTop + 10);
        doc.text('CUSTOMER', 190, tableTop + 10);
        doc.text('BASE', 320, tableTop + 10);
        doc.text('DISC', 380, tableTop + 10);
        doc.text('PAID', 440, tableTop + 10);
        doc.text('STATUS', 500, tableTop + 10);

        // --- Transaction Rows ---
        let y = tableTop + 28;
        doc.fillColor('#334155').font('Helvetica');
        
        data.orders.forEach((order, index) => {
            // Auto Page-Break
            if (y > 740) {
                doc.addPage();
                y = 50;
                // Repeat Table Header
                doc.rect(40, y, 515, 25).fill('#334155');
                doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
                doc.text('ID', 50, y + 9);
                doc.text('DATE', 110, y + 9);
                doc.text('CUSTOMER', 190, y + 9);
                doc.text('BASE', 320, y + 9);
                doc.text('DISC', 380, y + 9);
                doc.text('PAID', 440, y + 9);
                doc.text('STATUS', 500, y + 9);
                y += 25;
            }

            // Alternate Row Shading
            if (index % 2 === 1) {
                doc.rect(40, y, 515, 24).fill('#f1f5f9');
            }
            
            doc.fillColor('#334155').fontSize(7.5);
            doc.text(`${(order.orderId || '').substring(0, 10)}`, 50, y + 8);
            doc.text(moment(order.createdAt).format('DD/MM/YY'), 110, y + 8);
            
            const customerName = order.userId ? (order.userId.Name || 'Guest').substring(0, 15) : 'Guest';
            doc.text(customerName, 190, y + 8);
            doc.text(`₹${(order.subtotal || 0).toLocaleString()}`, 320, y + 8);
            doc.text(`₹${((order.discount || 0) + (order.couponDiscount || 0)).toLocaleString()}`, 380, y + 8, { color: '#ef4444' });
            doc.text(`₹${(order.finalPrice || 0).toLocaleString()}`, 440, y + 8, { font: 'Helvetica-Bold' });
            doc.text((order.orderStatus || '').toUpperCase(), 500, y + 8);
            y += 24;
        });

        // --- Page Numbering Footnote ---
        const totalPages = doc.bufferedPageRange().count;
        for (let j = 0; j < totalPages; j++) {
            doc.switchToPage(j);
            doc.fillColor('#94a3b8').fontSize(7);
            doc.text(`Zyrox E-Commerce Solutions - Confidential Report - Page ${j + 1} of ${totalPages}`, 0, 805, { align: 'center' });
        }
        
        doc.end();
    } catch (error) {
        console.error("Critical Export PDF failure:", error);
        res.status(500).json({ success: false, message: "Could not generate PDF report" });
    }
};
