import {
    getVariantListingData,
    createVariant,
    updateVariant,
    toggleVariantActive,
    setVariantAsDefault,
    softDeleteVariant,
} from "../../services/adminServices/variantService.js";

// ─────────────────────────────────────────────
//  SESSION FLASH HELPERS
// ─────────────────────────────────────────────

const flashSuccess = (req, msg) => { req.session.successMsg = msg; };
const flashError   = (req, msg) => { req.session.errorMsg   = msg; };

/** Pops a session flash message (reads then deletes). */
const popFlash = (req, key) => {
    const msg = req.session[key];
    delete req.session[key];
    return msg;
};

/** Redirect helper to keep handlers tidy. */
const toVariants = (res, productId) =>
    res.redirect(`/admin/products/${productId}/variants`);

// ─────────────────────────────────────────────
//  GET  /admin/products/:id/variants
// ─────────────────────────────────────────────

const loadVariantListing = async (req, res) => {
    try {
        const { id: productId } = req.params;
        const page = parseInt(req.query.page, 10) || 1;

        const data = await getVariantListingData(productId, page);

        if (!data) return res.status(404).send("Product not found");

        return res.render("admin/products/variantListing", {
            ...data,
            user:       req.session.user,
            successMsg: popFlash(req, "successMsg"),
            errorMsg:   popFlash(req, "errorMsg"),
        });
    } catch (err) {
        console.error("[Variant] loadVariantListing error:", err);
        return res.status(500).send("Server Error");
    }
};

// ─────────────────────────────────────────────
//  POST  /admin/products/:id/variants
// ─────────────────────────────────────────────

const addVariant = async (req, res) => {
    const { id: productId } = req.params;

    try {
        const imageUrls = (req.files || []).map((f) => f.path);
        const result    = await createVariant(productId, req.body, imageUrls);

        if (result.error) {
            flashError(req, result.error);
        } else {
            flashSuccess(req, "Variant added successfully");
        }
    } catch (err) {
        console.error("[Variant] addVariant error:", err);
        flashError(req, "Failed to add variant");
    }

    return toVariants(res, productId);
};

// ─────────────────────────────────────────────
//  PUT  /admin/products/:id/variants/:variantId
// ─────────────────────────────────────────────

const editVariant = async (req, res) => {
    const { id: productId, variantId } = req.params;

    try {
        const newImageUrls = (req.files || []).map((f) => f.path);
        const result       = await updateVariant(productId, variantId, req.body, newImageUrls);

        if (result.error) {
            flashError(req, result.error);
        } else {
            flashSuccess(req, "Variant updated successfully");
        }
    } catch (err) {
        console.error("[Variant] editVariant error:", err);
        flashError(req, "Failed to update variant");
    }

    return toVariants(res, productId);
};

// ─────────────────────────────────────────────
//  PATCH  /admin/variants/:variantId/toggle
// ─────────────────────────────────────────────

const toggleVariant = async (req, res) => {
    try {
        const { variantId }   = req.params;
        const { isActive }    = req.body;
        const success         = await toggleVariantActive(variantId, isActive);
        return res.json({ success });
    } catch (err) {
        console.error("[Variant] toggleVariant error:", err);
        return res.json({ success: false });
    }
};

// ─────────────────────────────────────────────
//  PATCH  /admin/variants/:variantId/default
// ─────────────────────────────────────────────

const setDefaultVariant = async (req, res) => {
    try {
        const { variantId } = req.params;
        const result        = await setVariantAsDefault(variantId);

        if (result.error) {
            return res.json({ success: false, message: result.error });
        }
        return res.json({ success: true });
    } catch (err) {
        console.error("[Variant] setDefaultVariant error:", err);
        return res.json({ success: false });
    }
};

// ─────────────────────────────────────────────
//  DELETE  /admin/products/:id/variants/:variantId
// ─────────────────────────────────────────────

const deleteVariant = async (req, res) => {
    const { id: productId, variantId } = req.params;

    try {
        const result = await softDeleteVariant(productId, variantId);

        if (result.error) {
            flashError(req, result.error);
        } else {
            flashSuccess(req, "Variant deleted successfully");
        }
    } catch (err) {
        console.error("[Variant] deleteVariant error:", err);
        flashError(req, "Failed to delete variant");
    }

    return toVariants(res, productId);
};

export {
    loadVariantListing,
    addVariant,
    editVariant,
    toggleVariant,
    setDefaultVariant,
    deleteVariant,
};