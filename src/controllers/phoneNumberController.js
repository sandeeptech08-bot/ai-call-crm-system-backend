const phoneNumberService = require("../services/phoneNumberService");

/** GET /api/phone-numbers */
async function list(req, res, next) {
  try {
    const phoneNumbers = await phoneNumberService.getPhoneNumbers(req.user.id);
    return res.status(200).json({ success: true, phoneNumbers });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
}

module.exports = { list };
