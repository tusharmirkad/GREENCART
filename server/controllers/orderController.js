import Product from "../models/product.js" ;
import Order from '../models/order.js' ;
import stripe from 'stripe' ;
import User from '../models/User.js' ;

// Place order COD: /api/order/COD
export const placeOrderCOD = async(req, res) => {
    try{
        const { userId, items, address} = req.body ;
        if(!address || items.length === 0){
            return res.json({success: false, message: "Invalid Data"}) ;
        }

        // Calculate amount using items
        let amount = await items.reduce(async (acc, item)=>{
            const product = await Product.findById(item.product);
            return (await acc) + product.offerPrice * item.quantity ;
        }, 0)

        // Add tax charge 2 %
        amount += Math.floor(amount * 0.02) ;

        await Order.create({
            userId,
            items,
            amount,
            address,
            paymentType : "COD"
        }) ;

        return res.json({success:true, message: "Order placed successfully"}) ;
    }catch(err){
        console.log(err.message);
        res.json({success:false, message: err.message}) ;
    }
}

// Place order COD: /api/order/stripe
export const placeOrderStripe = async(req, res) => {
    try{
        const { userId, items, address} = req.body ;
        const {origin} = req.headers;
        if(!address || items.length === 0){
            return res.json({success: false, message: "Invalid Data"}) ;
        }

        let productData = [] ;

        // Calculate amount using items
        let amount = await items.reduce(async (acc, item)=>{
            const product = await Product.findById(item.product);
            productData.push({
                name: product.name,
                price: product.offerPrice,
                quantity: item.quantity
            })
            return (await acc) + product.offerPrice * item.quantity ;
        }, 0)

        // Add tax charge 2 %
        amount += Math.floor(amount * 0.02) ;

        const order = await Order.create({
            userId,
            items,
            amount,
            address,
            paymentType : "Online"
        }) ;

        // stripe gateway initialise
        const stripeInstances = new stripe(process.env.STRIPE_SECRET_KEY) ;

        // create line items for stripe
        const line_items = productData.map((item) => {
            return {
                price_data : {
                    currency: "usd",
                    product_data : {
                        name: item.name,
                    },
                    unit_amount: Math.floor(item.price + item.price * 0.02) * 100
                },
                quantity: item.quantity,
            }
        })

        // create session
        const session = await stripeInstances.checkout.sessions.create({
            line_items,
            mode: "payment",
            success_url: `${origin}/loader?next=my-orders`,
            cancel_url: `${origin}/cart`,
            metadata: {
                orderId: order._id.toString(),
                userId,
            }
        })

        return res.json({success:true, url: session.url}) ;
    }catch(err){
        console.log(err.message);
        res.json({success:false, message: err.message}) ;
    }
}

// Stripe webhooks to verify payments actions : /stripe
export const stripeWebhooks = async(req, res) => {
    // stripe gateway initialise
    const stripeInstances = new stripe(process.env.STRIPE_SECRET_KEY) ;

    const sig = req.headers["stripe-signature"];
    let event ;

    try{
        event = stripeInstances.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET,
        ) ;
    } catch(err){
        res.status(400).send(`Webhook Error: ${err.message}`)
    }

    // handle the event
    switch(event.type){
        case "payment_intent.succeeded": {
            console.log("💰 Payment succeeded");

            const paymentIntent = event.data.object ;
            const paymentIntentId = paymentIntent.id ;

            try {

            // Getting sesssion metadata
            const session = await stripeInstances.checkout.sessions.list({
                payment_intent: paymentIntent.id,
            }) ;

            console.log("📦 Stripe session fetched:", session?.id);


            const { orderId, userId } = session.data[0]?.metadata || {};

            if (!orderId || !userId) {
                console.error("Missing metadata in session");
                return;
              }
              
            console.log("Order ID:", orderId);

            // mark payment as paid
            await Order.findByIdAndUpdate(orderId, {isPaid: true}, { new: true }) ;

            console.log("🧹 Clearing cart for user:", userId);
            // Clear user cart
            await User.findByIdAndUpdate(userId, {cartItems: {}}) ;
            break ;
            }catch(err){
                console.error("❌ Error during order update or cart clear:", err.message);
            }
        }


        case "payment_intent.payment_failed": {
            const paymentIntent = event.data.object ;
            const paymentIntentId = paymentIntent.id ;

            // Getting sesssion metadata
            const session = await stripeInstances.checkout.sessions.list({
                payment_intent: paymentIntentId
            }) ;

            const { orderId } = session.data[0].metadata ;
            await Order.findByIdAndDelete(orderId) ;
            break ;
        }

        default: 
            console.error(`Unhandled event type ${event.type}`) ;
            break ;
    }
    res.json({recieved: true})
}

// Get order by User Id: /api/order/user
export const getUserOrder = async(req, res)=>{
    try{
        const { userId } = req.body ;
        const orders = await Order.find({
            userId,
            $or: [{paymentType:"COD"}, {isPaid: true}]
        }).populate("items.product address").sort({createdAt: -1}) ;
        res.json({success: true, orders})
    }catch(err){
        console.log(err.message);
        res.json({success:false, message: err.message}) ;
    }
}

// Get all orders (for seller / admin ) : /api/order/seller 
export const getAllOrder = async(req, res)=>{
    try{
        const orders = await Order.find({
            $or: [{paymentType:"COD"}, {isPaid: true}]
        }).populate("items.product address").sort({createdAt: -1}) ;
        res.json({success: true, orders})
    }catch(err){
        console.log(err.message);
        res.json({success:false, message: err.message}) ;
    }
}