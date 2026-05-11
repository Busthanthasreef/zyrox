import Order from "../../models/order.js";
import User from "../../models/user.js";
import moment from "moment";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

// ─────────────────────────────────────────────
//  DATE HELPERS
// ─────────────────────────────────────────────

/**
 * Returns { startDate, endDate } for the given filter type.
 * Falls back to the full epoch → now range for unknown types.
 */
export const getFilterDates = (filterType, customStart, customEnd) => {
    switch (filterType) {
        case "daily":
            return {
                startDate: moment().startOf("day").toDate(),
                endDate:   moment().endOf("day").toDate(),
            };

        case "weekly":
            return {
                startDate: moment().subtract(6, "days").startOf("day").toDate(),
                endDate:   moment().endOf("day").toDate(),
            };

        case "monthly":
            return {
                startDate: moment().startOf("month").toDate(),
                endDate:   moment().endOf("month").toDate(),
            };

        case "yearly":
            return {
                startDate: moment().startOf("year").toDate(),
                endDate:   moment().endOf("year").toDate(),
            };

        case "custom":
            return customStart && customEnd
                ? {
                    startDate: moment(customStart).startOf("day").toDate(),
                    endDate:   moment(customEnd).endOf("day").toDate(),
                  }
                : {
                    startDate: moment().startOf("day").toDate(),
                    endDate:   moment().endOf("day").toDate(),
                  };

        default:
            return { startDate: new Date(0), endDate: new Date() };
    }
};

// ─────────────────────────────────────────────
//  QUERY BUILDERS
// ─────────────────────────────────────────────

const CANCELLED_STATUSES = [
    "Cancelled",
    "Returned",
    "Cancellation Requested",
    "Return Requested",
];

/**
 * Builds the base Mongoose query object for the given filters.
 * This query is used for fetching the order list (includes cancelled orders
 * when status filter explicitly requests them).
 */
const buildOrderQuery = async (startDate, endDate, search, status) => {
    const query = {
        createdAt: { $gte: startDate, $lte: endDate },
    };

    if (status) {
        query.orderStatus = status;
        if (!CANCELLED_STATUSES.includes(status)) {
            query.paymentStatus = { $ne: "Failed" };
        }
    } else {
        query.orderStatus    = { $nin: CANCELLED_STATUSES };
        query.paymentStatus  = { $ne: "Failed" };
    }

    if (search) {
        const matchedUsers = await User.find({
            $or: [
                { Name:  { $regex: search, $options: "i" } },
                { Email: { $regex: search, $options: "i" } },
            ],
        }).select("_id");

        const userIds = matchedUsers.map((u) => u._id);

        query.$or = [{ orderId: { $regex: search, $options: "i" } }];
        if (userIds.length > 0) {
            query.$or.push({ userId: { $in: userIds } });
        }
    }

    return query;
};

/**
 * Derives the revenue query from the order query.
 * Cancelled/returned orders never contribute to revenue totals.
 */
const buildRevenueQuery = (orderQuery, status) => {
    const revenueQuery = { ...orderQuery };

    if (status && CANCELLED_STATUSES.includes(status)) {
        // Force the aggregation to match nothing
        revenueQuery._id = "impossible_for_revenue";
    }

    return revenueQuery;
};

// ─────────────────────────────────────────────
//  AGGREGATION HELPERS
// ─────────────────────────────────────────────

const fetchTotals = async (revenueQuery) => {
    const [totalsData, productsSoldData] = await Promise.all([
        Order.aggregate([
            { $match: revenueQuery },
            {
                $group: {
                    _id:           null,
                    totalSales:    { $sum: "$finalPrice" },
                    totalDiscount: { $sum: "$discount" },
                    count:         { $sum: 1 },
                },
            },
        ]),

        Order.aggregate([
            { $match: revenueQuery },
            { $unwind: "$items" },
            { $group: { _id: null, total: { $sum: "$items.quantity" } } },
        ]),
    ]);

    return {
        totalSales:        totalsData[0]?.totalSales        ?? 0,
        totalDiscount:     totalsData[0]?.totalDiscount     ?? 0,
        count:             totalsData[0]?.count             ?? 0,
        totalProductsSold: productsSoldData[0]?.total       ?? 0,
    };
};

/**
 * Builds time-series chart data for the selected period.
 * – Same day  → 3-hour bucket breakdown
 * – ≤31 days  → daily aggregation
 * – >31 days  → monthly aggregation
 */
const fetchPeriodChartData = async (revenueQuery, startDate, endDate) => {
    const diffDays = moment(endDate).diff(moment(startDate), "days");

    if (diffDays === 0) {
        // Intraday: 3-hour buckets (IST)
        const buckets = [
            { label: ["8 - 11", "AM - AM"],  start: 8,  end: 11, total: 0 },
            { label: ["11 - 2", "AM - PM"],  start: 11, end: 14, total: 0 },
            { label: ["2 - 5",  "PM - PM"],  start: 14, end: 17, total: 0 },
            { label: ["5 - 8",  "PM - PM"],  start: 17, end: 20, total: 0 },
            { label: ["8 - 11", "PM - PM"],  start: 20, end: 23, total: 0 },
            { label: ["11 - 2", "PM - AM"],  start: 23, end: 2,  total: 0 },
            { label: ["2 - 5",  "AM - AM"],  start: 2,  end: 5,  total: 0 },
            { label: ["5 - 8",  "AM - AM"],  start: 5,  end: 8,  total: 0 },
        ];

        const todaysOrders = await Order.find(revenueQuery).select("createdAt finalPrice");

        todaysOrders.forEach((order) => {
            const hour = moment(order.createdAt).utcOffset("+05:30").hour();

            for (const bucket of buckets) {
                const wraps = bucket.start >= bucket.end;
                const inBucket = wraps
                    ? hour >= bucket.start || hour < bucket.end
                    : hour >= bucket.start && hour < bucket.end;

                if (inBucket) {
                    bucket.total += order.finalPrice ?? 0;
                    break;
                }
            }
        });

        return {
            labels: buckets.map((b) => b.label),
            values: buckets.map((b) => b.total),
        };
    }

    // Multi-day: aggregate by day or month
    const groupFormat = diffDays > 31 ? "%Y-%m" : "%Y-%m-%d";

    const chartAggr = await Order.aggregate([
        { $match: revenueQuery },
        {
            $group: {
                _id:   { $dateToString: { format: groupFormat, date: "$createdAt" } },
                total: { $sum: "$finalPrice" },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    return {
        labels: chartAggr.map((c) => c._id),
        values: chartAggr.map((c) => c.total),
    };
};

/**
 * Returns an array[12] of monthly revenue totals for the current calendar year.
 */
const fetchYearlyChartData = async () => {
    const yearlyAggr = await Order.aggregate([
        {
            $match: {
                orderStatus:   { $nin: CANCELLED_STATUSES },
                paymentStatus: { $ne: "Failed" },
                createdAt: {
                    $gte: moment().startOf("year").toDate(),
                    $lte: moment().endOf("year").toDate(),
                },
            },
        },
        {
            $group: {
                _id:   { $month: "$createdAt" },
                total: { $sum: "$finalPrice" },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    const yearlyData = Array(12).fill(0);
    yearlyAggr.forEach((item) => {
        yearlyData[item._id - 1] = item.total;
    });

    return yearlyData;
};

// ─────────────────────────────────────────────
//  PUBLIC SERVICE METHODS
// ─────────────────────────────────────────────

/**
 * Fetches paginated sales data along with KPI totals and chart data.
 *
 * @param {Date}   startDate
 * @param {Date}   endDate
 * @param {number} page
 * @param {number} limit
 * @param {string} search
 * @param {string} status
 */
export const getSalesData = async (
    startDate,
    endDate,
    page  = 1,
    limit = 10,
    search = "",
    status = ""
) => {
    const orderQuery   = await buildOrderQuery(startDate, endDate, search, status);
    const revenueQuery = buildRevenueQuery(orderQuery, status);

    const [totals, periodChart, yearlyChart] = await Promise.all([
        fetchTotals(revenueQuery),
        fetchPeriodChartData(revenueQuery, startDate, endDate),
        fetchYearlyChartData(),
    ]);

    const skip   = (page - 1) * limit;
    const orders = await Order.find(orderQuery)
        .populate("userId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    return {
        orders,
        totalSalesAmount:  totals.totalSales,
        totalDiscounts:    totals.totalDiscount,
        totalOrders:       totals.count,
        totalProductsSold: totals.totalProductsSold,
        currentPage:       page,
        totalPages:        Math.ceil(totals.count / limit),
        chartData:         periodChart,
        yearlyChartData:   yearlyChart,
    };
};

// ─────────────────────────────────────────────
//  EXPORT GENERATORS
// ─────────────────────────────────────────────

/**
 * Writes a styled Excel workbook to the provided Express response stream.
 */
export const generateExcelReport = async (res, data, startDate, endDate) => {
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    // ── Column definitions ─────────────────────
    worksheet.columns = [
        { header: "Order ID",          key: "orderId",    width: 22 },
        { header: "Date",              key: "date",       width: 22 },
        { header: "Customer",          key: "customer",   width: 26 },
        { header: "Items Amount (₹)",  key: "amount",     width: 18 },
        { header: "Discount (₹)",      key: "discount",   width: 16 },
        { header: "Final Amount (₹)",  key: "finalPrice", width: 20 },
        { header: "Payment Method",    key: "payment",    width: 18 },
        { header: "Status",            key: "status",     width: 20 },
    ];

    // ── Style header row ───────────────────────
    worksheet.getRow(1).eachCell((cell) => {
        cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
        cell.alignment = { horizontal: "center" };
        cell.border    = {
            bottom: { style: "thin", color: { argb: "FF334155" } },
        };
    });

    // ── Data rows ──────────────────────────────
    data.orders.forEach((order, i) => {
        const row = worksheet.addRow({
            orderId:    order.orderId,
            date:       moment(order.createdAt).format("YYYY-MM-DD HH:mm"),
            customer:   order.userId?.Name || order.userId?.Email || "Guest",
            amount:     order.subtotal    ?? 0,
            discount:   (order.discount ?? 0) + (order.couponDiscount ?? 0),
            finalPrice: order.finalPrice  ?? 0,
            payment:    order.paymentMethod || "N/A",
            status:     order.orderStatus  || "N/A",
        });

        // Alternate row shading
        if (i % 2 === 0) {
            row.eachCell((cell) => {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
            });
        }
    });

    // ── Summary footer ─────────────────────────
    worksheet.addRow([]);

    const addSummaryRow = (label, value, colIndex) => {
        const row = worksheet.addRow([]);
        row.getCell(1).value = label;
        row.getCell(1).font  = { bold: true };
        row.getCell(colIndex).value = value;
        row.getCell(colIndex).font  = { bold: true };
    };

    addSummaryRow("Total Orders",   data.totalOrders,       1);
    addSummaryRow("Total Sales",    `₹${data.totalSalesAmount}`, 6);
    addSummaryRow("Total Discount", `₹${data.totalDiscounts}`,   5);

    // ── Stream response ────────────────────────
    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=Zyrox_Sales_Report.xlsx");

    await workbook.xlsx.write(res);
    res.end();
};

/**
 * Streams a branded PDF sales report to the provided Express response stream.
 */
export const generatePdfReport = (res, data, startDate, endDate) => {
    return new Promise((resolve, reject) => {
        try {
            const doc      = new PDFDocument({ margin: 40, size: "A4" });
            const filename = `Zyrox_Sales_Report_${moment().format("YYYYMMDD")}.pdf`;

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
            doc.pipe(res);

            // ── Branded header ─────────────────────
            doc.rect(0, 0, 612, 110).fill("#1e293b");

            doc.fillColor("#ffffff").fontSize(26).font("Helvetica-Bold").text("ZYROX", 40, 40);
            doc.fontSize(10).font("Helvetica").text("ADMINISTRATIVE SALES REPORT", 40, 72);
            doc.fontSize(9).text(
                `Generated: ${moment().format("MMMM Do YYYY, h:mm a")}`,
                400, 45,
                { align: "right", width: 160 }
            );
            doc.fontSize(9).text(
                `Period: ${moment(startDate).format("DD MMM YYYY")} – ${moment(endDate).format("DD MMM YYYY")}`,
                400, 60,
                { align: "right", width: 160 }
            );

            // ── KPI cards ──────────────────────────
            const CARD_Y      = 140;
            const CARD_W      = 165;
            const CARD_H      = 65;
            const CARD_MARGIN = 175;

            const kpis = [
                { label: "TOTAL TRANSACTIONS", value: data.totalOrders.toString(),              color: "#1e293b", x: 40 },
                { label: "GROSS SALES AMOUNT",  value: `₹${data.totalSalesAmount.toLocaleString()}`, color: "#3b82f6", x: 40 + CARD_MARGIN },
                { label: "TOTAL DEDUCTIONS",    value: `₹${data.totalDiscounts.toLocaleString()}`,   color: "#ef4444", x: 40 + CARD_MARGIN * 2 },
            ];

            kpis.forEach(({ label, value, color, x }) => {
                doc.rect(x, CARD_Y, CARD_W, CARD_H).fill("#f8fafc");
                doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text(label, x + 10, CARD_Y + 18);
                doc.fillColor(color).fontSize(18).text(value, x + 10, CARD_Y + 35);
            });

            // ── Table header ───────────────────────
            const TABLE_TOP = 235;
            doc.rect(40, TABLE_TOP, 515, 28).fill("#334155");

            const COL = { id: 48, date: 108, customer: 178, base: 278, disc: 330, paid: 385, payment: 440, status: 500 };

            const writeTableHeader = (y) => {
                doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
                doc.text("ORDER ID",  COL.id,       y + 10);
                doc.text("DATE",      COL.date,     y + 10);
                doc.text("CUSTOMER",  COL.customer, y + 10);
                doc.text("BASE",      COL.base,     y + 10);
                doc.text("DISC",      COL.disc,     y + 10);
                doc.text("PAID",      COL.paid,     y + 10);
                doc.text("PAYMENT",   COL.payment,  y + 10);
                doc.text("STATUS",    COL.status,   y + 10);
            };

            writeTableHeader(TABLE_TOP);

            // ── Order rows ─────────────────────────
            let y = TABLE_TOP + 28;

            data.orders.forEach((order, idx) => {
                if (y > 740) {
                    doc.addPage();
                    y = 50;
                    doc.rect(40, y, 515, 25).fill("#334155");
                    writeTableHeader(y);
                    y += 25;
                }

                if (idx % 2 === 1) {
                    doc.rect(40, y, 515, 24).fill("#f1f5f9");
                }

                const customer = (order.userId?.Name || "Guest").substring(0, 12);
                const discount = (order.discount ?? 0) + (order.couponDiscount ?? 0);

                doc.fillColor("#334155").fontSize(7.5).font("Helvetica");
                doc.text((order.orderId || "").substring(0, 11),       COL.id,       y + 8);
                doc.text(moment(order.createdAt).format("DD/MM/YY"),   COL.date,     y + 8);
                doc.text(customer,                                      COL.customer, y + 8);
                doc.text(`₹${(order.subtotal ?? 0).toLocaleString()}`, COL.base,     y + 8);
                doc.fillColor("#ef4444");
                doc.text(`₹${discount.toLocaleString()}`,              COL.disc,     y + 8);
                doc.fillColor("#1e293b").font("Helvetica-Bold");
                doc.text(`₹${(order.finalPrice ?? 0).toLocaleString()}`, COL.paid,  y + 8);
                doc.fillColor("#334155").font("Helvetica");
                doc.text((order.paymentMethod || "N/A"),               COL.payment,  y + 8);
                doc.text((order.orderStatus || "").toUpperCase(),      COL.status,   y + 8);

                y += 24;
            });

            // ── Page numbers ───────────────────────
            doc.on("pageAdded", () => {});  // keep stream open

            doc.end();

            // After end(), write page numbers via buffered range
            doc.once("end", () => {
                const totalPages = doc.bufferedPageRange().count;
                for (let j = 0; j < totalPages; j++) {
                    doc.switchToPage(j);
                    doc.fillColor("#94a3b8").fontSize(7);
                    doc.text(
                        `Zyrox E-Commerce Solutions — Confidential Report — Page ${j + 1} of ${totalPages}`,
                        0, 805,
                        { align: "center" }
                    );
                }
                resolve();
            });

            doc.on("error", reject);
        } catch (err) {
            reject(err);
        }
    });
};