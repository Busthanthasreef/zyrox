import User from "../../models/user.js";
import bcrypt from "bcrypt";

const adminProfile = async (req, res) => {
    try {
        const adminData = req.session.admin;
        const adminId = typeof adminData === 'object' ? adminData._id : adminData;
        const admin = await User.findById(adminId) || adminData;

        res.render("admin/profile/adminProfile", {
            admin: admin,
            currentPage: 'profile'
        });
    } catch (error) {
        console.error("Admin Profile Error:", error);
        res.redirect("/adminUser/dashboard");
    }
};

const updateProfile = async (req, res) => {
    try {
        const adminData = req.session.admin;
        if (!adminData) return res.status(401).json({ success: false, message: 'Unauthorized' });
        
        const adminId = typeof adminData === 'object' ? adminData._id : adminData;
        const { field, value } = req.body;

        const allowedFields = ['Name', 'Email', 'Phone'];
        if (!allowedFields.includes(field)) {
            return res.status(400).json({ success: false, message: 'Invalid field' });
        }

        const updateDoc = { [field]: value };
        const updatedUser = await User.findOneAndUpdate({_id: adminId, isAdmin: true}, updateDoc, { returnDocument: 'after' });

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        if (typeof req.session.admin === 'object') {
            req.session.admin[field] = value;
        }

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error("Admin Update Profile Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const changePassword = async (req, res) => {
    try {
        const adminData = req.session.admin;
        if (!adminData) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const adminId = typeof adminData === 'object' ? adminData._id : adminData;
        const { currentPassword, newPassword } = req.body;

        const admin = await User.findById(adminId);
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, admin.Password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Incorrect current password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        admin.Password = hashedPassword;
        await admin.save();

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error("Admin Change Password Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const uploadProfileImage = async (req, res) => {
    try {
        const adminData = req.session.admin;
        if (!adminData) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const adminId = typeof adminData === 'object' ? adminData._id : adminData;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const imageUrl = req.file.path;

        const updatedAdmin = await User.findOneAndUpdate(
            { _id: adminId, isAdmin: true },
            { image: imageUrl },
            { new: true }
        );

        if (!updatedAdmin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        if (typeof req.session.admin === 'object') {
            req.session.admin.image = imageUrl;
        }

        res.json({ success: true, message: 'Profile image updated successfully', imageUrl });
    } catch (error) {
        console.error("Admin Profile Image Upload Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const deleteProfileImage = async (req, res) => {
    try {
        const adminData = req.session.admin;
        if (!adminData) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const adminId = typeof adminData === 'object' ? adminData._id : adminData;

        const updatedAdmin = await User.findOneAndUpdate(
            { _id: adminId, isAdmin: true },
            { $unset: { image: "" } },
            { new: true }
        );

        if (!updatedAdmin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        if (typeof req.session.admin === 'object') {
            delete req.session.admin.image;
        }

        res.json({ success: true, message: 'Profile image deleted successfully' });
    } catch (error) {
        console.error("Admin Profile Image Delete Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

export {
    adminProfile,
    updateProfile,
    changePassword,
    uploadProfileImage,
    deleteProfileImage
};
