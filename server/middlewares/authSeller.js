import jwt from 'jsonwebtoken' ;

const authSeller = async(req,res, next) => {
    const { token } = req.cookies ;

    if(!token){
        return res.json({success: false, message: "User Not Authorized."}) ;
    }

    try{
        const tokenDecode = jwt.verify(token, process.env.JWT_SECRET) ;
        if(tokenDecode.email === process.env.SELLER_EMAIL){
            next() ;
        }else{
            return res.json({success: false, message: "Not Authorized."}) ;
        }

    }catch(err){    
        return res.json({success: false, message: err.message}) ;
    }
}

export default authSeller ;