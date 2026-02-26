import Address from "../../models/address.js";

const LoadUserAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    const totalAddresses = await Address.countDocuments({ userId });
    const totalPages = Math.ceil(totalAddresses / limit);

    const addresses = await Address.find({ userId })
      .sort({ isDefault: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render('user/address/userAddress', { 
      address: addresses.length > 0 ? addresses : null,
      currentPage: page,
      totalPages: totalPages
    });
  } catch (error) {
    console.error("Load Address Error:", error);
    res.status(500).send("Server Error");
  }
}

const loadAddAddress = async (req, res) => {
  const errors    = req.session.addressErrors  || {};
  const formData  = req.session.addressFormData || {};
  const isDuplicate = req.session.isDuplicate   || false;

  delete req.session.addressErrors;
  delete req.session.addressFormData;
  delete req.session.isDuplicate;

  res.render('user/address/addAddress', { errors, isDuplicate, ...formData });
}

const addAddress = async (req, res) => {
  try {
    const { addressType, name, phone, houseName, locality, city, state, pincode, country, isDefault } = req.body;
    const errors = {};

    const trimmedName = name ? name.trim() : "";
    const trimmedHouse = houseName ? houseName.trim() : "";
    const trimmedLocality = locality ? locality.trim() : "";
    const trimmedCity = city ? city.trim() : "";
    const trimmedState = state ? state.trim() : "";
    const trimmedPincode = pincode ? pincode.trim() : "";

    // Validation
    const nameRegex = /^[A-Za-z\s]{3,50}$/;
    const indianPhone = /^[6-9]\d{9}$/;
    const pincodeRegex = /^\d{6}$/;

    if (!trimmedName || !nameRegex.test(trimmedName)) errors.name = "Enter a valid name (3-50 letters only)";
    if (!phone || !indianPhone.test(phone.trim())) errors.phone = "Enter a valid 10-digit Indian phone number starting with 6-9";
    if (!trimmedHouse) errors.houseName = "House Name/No is required";
    if (!trimmedLocality) errors.locality = "Locality is required";
    if (!trimmedCity) errors.city = "City is required";
    if (!trimmedState) errors.state = "State is required";
    if (!trimmedPincode || !pincodeRegex.test(trimmedPincode)) errors.pincode = "Enter a valid 6-digit pincode";

    const userId = req.session.user._id;

    if (Object.keys(errors).length > 0) {
      req.session.addressErrors    = errors;
      req.session.addressFormData  = req.body;
      return res.redirect("/address-add");
    }

    // Escape regex sensitive characters to prevent crashes
    const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const existingAddress = await Address.findOne({
      userId,
      addressType: { $regex: new RegExp(`^${escapeRegex(addressType)}$`, 'i') },
      name:        { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
      phone:       phone.trim(),
      houseName:   { $regex: new RegExp(`^${escapeRegex(trimmedHouse)}$`, 'i') },
      locality:    { $regex: new RegExp(`^${escapeRegex(trimmedLocality)}$`, 'i') },
      city:        { $regex: new RegExp(`^${escapeRegex(trimmedCity)}$`, 'i') },
      state:       { $regex: new RegExp(`^${escapeRegex(trimmedState)}$`, 'i') },
      pincode:     trimmedPincode,
      country:     { $regex: new RegExp(`^${escapeRegex(country)}$`, 'i') }
    });

    if (existingAddress) {
      req.session.isDuplicate      = true;
      req.session.addressFormData  = req.body;
      return res.redirect("/address-add");
    }

    if (isDefault === 'on') {
      await Address.updateMany({ userId }, { isDefault: false });
    }

    const newAddress = new Address({
      userId,
      addressType,
      name: trimmedName,
      phone: phone.trim(),
      houseName: trimmedHouse,
      locality: trimmedLocality,
      city: trimmedCity,
      state: trimmedState,
      pincode: trimmedPincode,
      country,
      isDefault: isDefault === 'on'
    });

    await newAddress.save();

    const addressCount = await Address.countDocuments({ userId });
    if (addressCount === 1) {
      newAddress.isDefault = true;
      await newAddress.save();
    }

    res.redirect("/address");

  } catch (error) {
    console.error("Add Address Error:", error);
    res.status(500).send("Server Error");
  }
}

const loadEditAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.user._id;
    const address = await Address.findOne({ _id: addressId, userId });
    
    if (!address) {
      return res.redirect("/address");
    }

    const errors      = req.session.addressErrors     || {};
    const isDuplicate = req.session.isDuplicate      || false;
    const formData    = req.session.addressFormData  || null;

    delete req.session.addressErrors;
    delete req.session.isDuplicate;
    delete req.session.addressFormData;

    res.render('user/address/editAddress', { 
      address: formData ? { ...formData, _id: addressId } : address, 
      errors, 
      isDuplicate 
    });
  } catch (error) {
    console.error("Load Edit Address Error:", error);
    res.redirect("/address");
  }
}

const updateAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.user._id;
    const { addressType, name, phone, houseName, locality, city, state, pincode, country, isDefault } = req.body;
    const errors = {};

    const trimmedName = name ? name.trim() : "";
    const trimmedHouse = houseName ? houseName.trim() : "";
    const trimmedLocality = locality ? locality.trim() : "";
    const trimmedCity = city ? city.trim() : "";
    const trimmedState = state ? state.trim() : "";
    const trimmedPincode = pincode ? pincode.trim() : "";

    // Validation
    const nameRegex = /^[A-Za-z\s]{3,50}$/;
    const indianPhone = /^[6-9]\d{9}$/;
    const pincodeRegex = /^\d{6}$/;

    if (!trimmedName || !nameRegex.test(trimmedName)) errors.name = "Enter a valid name (3-50 letters only)";
    if (!phone || !indianPhone.test(phone.trim())) errors.phone = "Enter a valid 10-digit Indian phone number starting with 6-9";
    if (!trimmedHouse) errors.houseName = "House Name/No is required";
    if (!trimmedLocality) errors.locality = "Locality is required";
    if (!trimmedCity) errors.city = "City is required";
    if (!trimmedState) errors.state = "State is required";
    if (!trimmedPincode || !pincodeRegex.test(trimmedPincode)) errors.pincode = "Enter a valid 6-digit pincode";

    if (Object.keys(errors).length > 0) {
      req.session.addressErrors   = errors;
      req.session.addressFormData = req.body;
      return res.redirect(`/address-edit/${addressId}`);
    }

    // Escape regex sensitive characters
    const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Duplicate check for edit (excluding own)
    const existingAddress = await Address.findOne({
      userId,
      _id:         { $ne: addressId },
      addressType: { $regex: new RegExp(`^${escapeRegex(addressType)}$`, 'i') },
      name:        { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
      phone:       phone.trim(),
      houseName:   { $regex: new RegExp(`^${escapeRegex(trimmedHouse)}$`, 'i') },
      locality:    { $regex: new RegExp(`^${escapeRegex(trimmedLocality)}$`, 'i') },
      city:        { $regex: new RegExp(`^${escapeRegex(trimmedCity)}$`, 'i') },
      state:       { $regex: new RegExp(`^${escapeRegex(trimmedState)}$`, 'i') },
      pincode:     trimmedPincode,
      country:     { $regex: new RegExp(`^${escapeRegex(country)}$`, 'i') }
    });

    if (existingAddress) {
      req.session.isDuplicate     = true;
      req.session.addressFormData = req.body;
      return res.redirect(`/address-edit/${addressId}`);
    }

    // Use the validated 10-digit number
    const cleanPhone = phone;

    // If setting as default, unset others
    if (isDefault === 'on') {
      await Address.updateMany({ userId }, { isDefault: false });
    }

    await Address.findOneAndUpdate(
      { _id: addressId, userId },
      {
        addressType,
        name: trimmedName,
        phone: cleanPhone,
        houseName: trimmedHouse,
        locality: trimmedLocality,
        city: trimmedCity,
        state: trimmedState,
        pincode: trimmedPincode,
        country,
        isDefault: isDefault === 'on'
      }
    );

    res.redirect("/address");
  } catch (error) {
    console.error("Update Address Error:", error);
    res.status(500).send("Server Error");
  }
}

const setDefaultAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.user._id;

    await Address.updateMany({ userId }, { isDefault: false });
    const updated = await Address.findOneAndUpdate({ _id: addressId, userId }, { isDefault: true });

    if (!updated) {
        return res.json({ success: false, message: "Address not found" });
    }

    res.json({ success: true, message: "Default address updated" });
  } catch (error) {
    console.error("Set Default Address Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
}

const deleteAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.user._id;

    const addressToDelete = await Address.findOne({ _id: addressId, userId });
    if (!addressToDelete) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    const wasDefault = addressToDelete.isDefault;
    await Address.findByIdAndDelete(addressId);

    if (wasDefault) {
      const nextAddress = await Address.findOne({ userId }).sort({ createdAt: -1 });
      
      if (nextAddress) {
        nextAddress.isDefault = true;
        await nextAddress.save();
      }
    }

    res.json({ success: true, message: "Address deleted successfully" });
  } catch (error) {
    console.error("Delete Address Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
}

export { LoadUserAddress, loadAddAddress, addAddress, deleteAddress, loadEditAddress, updateAddress, setDefaultAddress };