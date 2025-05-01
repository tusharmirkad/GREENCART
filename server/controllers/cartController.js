import User from "../models/User.js";


// update user Cartdata : /api/cart/update
export const updateCart = async(req, res) => {
    try {
        const { userId, cartItems } = req.body;  // Expecting cartItems to be passed in the request body
        await User.findByIdAndUpdate(userId, { cartItems });

        res.json({ success: true, message: "Cart Updated" });
    } catch (err) {
        console.log(err);
        res.json({ success: false, message: 'Failed to update cart' });
    }
}