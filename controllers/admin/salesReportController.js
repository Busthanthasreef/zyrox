import {
    getFilterDates,
    getSalesData,
    generateExcelReport,
    generatePdfReport,
} from "../../services/adminServices/salesReportService.js";

// ─────────────────────────────────────────────
//  GET  /adminUser/sales-report
// ─────────────────────────────────────────────

/**
 * Renders the sales report dashboard page.
 */
export const getSalesReport = async (req, res) => {
    try {
        const {
            filterType   = "monthly",
            startDate: customStart,
            endDate:   customEnd,
            search       = "",
            status       = "",
            page         = "1",
        } = req.query;

        const { startDate, endDate } = getFilterDates(filterType, customStart, customEnd);

        const data = await getSalesData(
            startDate,
            endDate,
            parseInt(page, 10),
            5,
            search,
            status
        );

        return res.render("admin/salesReport/index", {
            currentUser: req.session.admin,
            data,
            filterType,
            customStart,
            customEnd,
            search,
            status,
        });
    } catch (error) {
        console.error("[SalesReport] getSalesReport error:", error);
        return res.status(500).send("Server Error");
    }
};

// ─────────────────────────────────────────────
//  GET  /adminUser/sales-report/export/excel
// ─────────────────────────────────────────────

/**
 * Streams an Excel (.xlsx) sales report to the client.
 */
export const exportExcel = async (req, res) => {
    try {
        const {
            filterType,
            startDate: customStart,
            endDate:   customEnd,
            search  = "",
            status  = "",
        } = req.query;

        const { startDate, endDate } = getFilterDates(filterType, customStart, customEnd);

        // Fetch all matching orders (no pagination cap)
        const data = await getSalesData(startDate, endDate, 1, 1_000_000, search, status);

        await generateExcelReport(res, data, startDate, endDate);
    } catch (error) {
        console.error("[SalesReport] exportExcel error:", error);
        return res.status(500).send("Failed to export Excel");
    }
};

// ─────────────────────────────────────────────
//  GET  /adminUser/sales-report/export/pdf
// ─────────────────────────────────────────────

/**
 * Streams a branded PDF sales report to the client.
 */
export const exportPDF = async (req, res) => {
    try {
        const {
            filterType,
            startDate: customStart,
            endDate:   customEnd,
            search  = "",
            status  = "",
        } = req.query;

        const { startDate, endDate } = getFilterDates(filterType, customStart, customEnd);

        // Fetch all matching orders (no pagination cap)
        const data = await getSalesData(startDate, endDate, 1, 1_000_000, search, status);

        await generatePdfReport(res, data, startDate, endDate);
    } catch (error) {
        console.error("[SalesReport] exportPDF error:", error);

        // Only send JSON error if headers haven't been flushed yet
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: "Could not generate PDF report",
            });
        }
    }
};