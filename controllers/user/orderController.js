import cartSchema from "../../models/cart.js";
import Product from "../../models/product.js";




const getMyOrders = async(req,res)=>{
    const user  = req.session.user;
    res.render('user/orders/myOrders',{user})
    
}

export{getMyOrders}