const express = require("express");
const User = require("../models/User");
const Product = require("../models/Product");
const fs = require('fs');
const cloudinary = require("../helpers/cloudinary");
const upload = require("../helpers/multer");
const verify_admin = require("../middlewares/verify-admin");
const verify_user = require("../middlewares/verify-user");
const check_product_duplication = require("../middlewares/check-product-duplication");
const cors = require("cors");

const products = express.Router();

products.post("/create", verify_admin, upload.array("product_images"), check_product_duplication, async (req, res) => {
    let { product_name, original_price, sale_price, category, description, number_in_stock, product_type } = req.body;
    const user_id = req.user._id;

    const user = await User.findById(user_id);

    if (user?.role  !== "admin") {
        return res.status(403).json({
            message: "You dont have access!"
        });
    }
    
    const uploader = async (path) => await cloudinary.uploads(path, "Images");
    const product_images = [];
    
    if (!req.files) {
        return res.status(400).json({
            message: "Product images not found!"
        });
        
    }
    
    const files = req.files;
    for (const file of files) {
        const { path } = file;
        const newPath = await uploader(path);
        product_images.push(newPath);
        fs.unlinkSync(path);
    }

    let transformedProductImages = product_images.map(url => url.replace(/upload\//g, "upload/c_fit,h_500,w_500/"));
    const product = await Product.create({
        product_name,
        original_price: +original_price,
        sale_price: +sale_price,
        product_images: transformedProductImages,
        category,
        description,
        number_in_stock: +number_in_stock,
        product_type
    });

    res.status(201).json({
        payload: product
    })
})

products.put("/update/:id", verify_admin, upload.array("product_images"), async (req, res) => {
    const id = req.params.id
    let { product_name, original_price, sale_price, category, description, number_in_stock, product_type } = req.body;

    const product = await Product.findById(id);
    product.product_images.forEach((imgurl) => {
        cloudinary.destroyer(imgurl);
    })


    const uploader = async (path) => await cloudinary.uploads(path, "Images");
    const product_images = [];
    
    if (!req.files) {
        return res.status(400).json({
            message: "Product images not found!"
        });
        
    }

    const files = req.files;
    for (const file of files) {
        const { path } = file;
        const newPath = await uploader(path);
        product_images.push(newPath);
        fs.unlinkSync(path);
    }

    let transformedProductImages = product_images.map(url => url.replace(/upload\//g, "upload/c_fit,h_500,w_500/"));

    const updatedProduct = await Product.findByIdAndUpdate({ _id: id}, {
        product_name,
        original_price: +original_price,
        sale_price: +sale_price,
        product_images: transformedProductImages,
        category,
        description,
        number_in_stock: +number_in_stock,
        product_type
    })

    res.status(200).json({
        payload: updatedProduct,
        message: "Success"
    })

})

products.patch("/product-increment/:id", async (req, res) => {
    const id = req.params.id
    const updatedProduct = await Product.findByIdAndUpdate({ _id: id}, {
        $inc: {
            number_in_stock: 1
        },
        
    },  { new: true });
    res.status(200).json({
        payload: updatedProduct
    })
})

products.patch("/product-decrement/:id", async (req, res) => {
    const id = req.params.id
    const updatedProduct = await Product.findByIdAndUpdate({ _id: id}, {
        $inc: {
            number_in_stock: -1
        },
        
    },  { new: true });
    res.status(200).json({
        payload: updatedProduct
    })
})

products.delete("/:id", async (req, res) => {
    const id = req.params.id
    const deletedProduct = await Product.findByIdAndDelete(id)
    res.status(200).json({
        payload: deletedProduct
    })
})

products.get("/search/:productName", async (req, res) => {
    const productName = req.params.productName
    const searchResults = await Product.find(
        {
            "$or": [
                { product_name: { $regex: productName, $options: "i" } },
                { product_type: { $regex: productName, $options: "i" } },
                { category: { $regex: productName, $options: "i" } }
            ]
          }
    ).limit(4)
        res.status(200).json({
            payload: searchResults,
            total: searchResults.length
        });
})

products.get("/category", async (req, res) => {
    const categories = await Product.distinct("category")
    res.json({
        payload: categories
    })
})

products.get("/product-type", async (req, res) => {
    const productTypes = await Product.distinct("product_type")
    res.json({
        payload: productTypes
    })
})

products.get("/all", async (req, res) => {
    const limit = req.query.limit;
    const page = req.query.page || 1;
    const total = await Product.countDocuments({});
    const products = await Product.find({}).limit(limit).skip(limit * (page - 1))
    res.json({
        payload: products,
        total,
    })
});

products.get("/reel", async (req, res) => {
    const products = await Product.find({}).limit(8)
    res.json({
        payload: products
    });
})

products.get("/most-popular", async (req, res) => {
    const products = await Product.find().sort({ likes: -1 }).limit(10);
    res.json({
        payload: products
    })
})

products.get("/by/:type", async (req, res) => {
    const { type } = req.query
    const { category } = req.query
    const products = await Product.find({$or:[
        {"product_type": type},
        {"category": category}
    ]})
    res.json({
        payload: products
    })
})

products.patch("/:product_id/like", verify_user, async (req, res) => {
    const product_id = req.params.product_id;
    const username = req.user.username;
    const user_id = req.user._id;

    const product = await Product.findById(product_id);
    if (!product.likedby.includes(username)) {
        await Product.findByIdAndUpdate(product_id, {
            $push: { likedby: username },
            $inc: {
                likes: 1
            }
        })
        await User.findByIdAndUpdate(user_id, {
            $push: { liked: product_id }
        })

        res.status(202).json({
            payload: {
                message: "Liked",
                product_id: product._id,
                likedby: username
            }
        })
    } 
    else{
        res.status(202).json({
            payload: {
                message: "Already liked",
                product_id: product._id,
                likedby: username
            }
        })
    }
})

products.patch("/:product_id/unlike", verify_user, async (req, res) => {
    const product_id = req.params.product_id;
    const username = req.user.username;
    const user_id = req.user._id;
    const product = await Product.findById(product_id);

    if (product.likedby.includes(username)) {
        await Product.findByIdAndUpdate(product_id,
            {
                $pull: {
                    likedby: username
                },
                $inc: {
                    likes: -1
                }
            })
            await User.findByIdAndUpdate(user_id, {
                $pull: { liked: product_id }
            })
            res.status(202).json({
                payload: {
                    message: "Unliked",
                    product_id: product._id,
                    likedby: username
                }
            })
    }
    else{
        res.status(202).json({
            payload: {
                message: "Already unliked",
                product_id: product._id,
                likedby: username
            }
        })
    }
})

module.exports = products