const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
require("dotenv").config();

const authentication = async (req, res, next) => {
  try {
    const token = req.headers.authorization;
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: payload._id, tokens: token }); // tokens: token - changed after user model/login was changed to one token only
    if (!user) {
      return res.status(401).send("Unauthorised request");
    }
    req.user = user;
    console.log(req.user._id + " authenticated");
    next();
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error with token");
  }
};

const isAuthor = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params._id);
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).send({ msg: "Not the author" });
    }
    next();
  } catch (error) {
    console.error(error);
    return res.status(500).send(error);
  }
};

const isCommentAuthor = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params._id);
    if (comment.userId.toString() !== req.user._id.toString()) {
      return res.status(403).send({ msg: "Not the author" });
    }
    next();
  } catch (error) {
    console.error(error);
    return res.status(500).send(error);
  }
};

module.exports = { authentication, isAuthor, isCommentAuthor };
