const fs = require("fs"); //node.js file system module
const path = require("path"); //Necessary to provide full path for fs unlink
const Post = require("../models/Post");
const Comment = require("../models/Comment");

const PostController = {
  async create(req, res, next) {
    try {
      let data = req.body;
      if (req.file) {
        data = { ...req.body, image: req.file.filename };
      } else {
        delete data.image;
      }
      const post = await Post.create({ ...data, userId: req.user._id });
      res.status(201).send({ msg: "New post created", post });
    } catch (error) {
      console.error(error);
      next(error)
    }
  },

  async update(req, res) {
    try {
      let data = req.body;
      if (req.file) {
        data = { ...req.body, image: req.file.filename };
        const post = await Post.findById(req.params._id); // Delete old image from uploads if user provides a new one
        if (post.image) {
          const imagePath = path.join(__dirname, "../public/uploads/posts/", post.image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath); //Node.js method that deletes the corresponding file
          }
        }
      } else {
        delete data.image;
      }
      const post = await Post.findByIdAndUpdate(req.params._id, data, { new: true });
      res.status(200).send({ msg: "Post updated", post });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async delete(req, res) {
    try {
      const post = await Post.findByIdAndDelete(req.params._id);
      if (post.image) {
        const imagePath = path.join(__dirname, "../public/uploads/posts/", post.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      await Comment.deleteMany({ _id: { $in: post.commentIds } });
      res.status(200).send({ msg: "Post and uploaded files deleted", post });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async likePost(req, res) {
    try {
      const post = await Post.findByIdAndUpdate(req.params._id);
      if (post.likes.includes(req.user._id)) {
        return res.status(400).send("You've already liked this post");
      }
      post.likes.push(req.user._id);
      await post.save();
      res.status(201).send({ msg: "You've liked this post!", post });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async unlikePost(req, res) {
    try {
      const post = await Post.findByIdAndUpdate(req.params._id);
      if (post.likes.includes(req.user._id)) {
        post.likes.pull(req.user._id);
        await post.save();
        return res.status(200).send({ msg: "You've unliked the post.", post });
      } else {
        return res.status(400).send("Cannot unlike a post you haven't liked");
      }
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async getAll(req, res) {
    try {
      const posts = await Post.find()
        .populate("userId", "username")
        .populate("commentIds");
      res.status(200).send(posts);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async getTenPerPage(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const posts = await Post.find()
        .limit(limit)
        .skip((page - 1) * limit)
        .populate("userId", "username");
      res.status(200).send({ msg: `You're on page ${page} of posts`, posts });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async getById(req, res) {
    try {
      const post = await Post.findById(req.params._id)
        .populate("userId", "username")
        .populate({
          path: "likes",
          select: "username",
        })
        .populate({
          path: "commentIds",
          populate: {
            path: "userId",
            select: "username",
          },
        });
      res.status(200).send(post);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async getByTitle(req, res) {
    try {
      const posts = await Post.find({ $text: { $search: req.params.title } })
        .populate("userId", "username")
        .populate({
          path: "likes",
          select: "username",
        })
        .populate({
          path: "commentIds",
          populate: {
            path: "userId",
            select: "username",
          },
        });
      if (posts.length === 0) {
        return res.status(404).send("No such post");
      }
      res.status(200).send(posts);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async getFriendsPosts(req, res) {
    try {
      const posts = await Post.find({ userId: { $in: req.user.following } })
        .populate("userId", "username")
        .populate({
          path: "likes",
          select: "username",
        })
        .populate({
          path: "commentIds",
          populate: {
            path: "userId",
            select: "username",
          },
        });
      res.status(200).send({ msg: "Posts from people you follow", posts });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async getUsersPosts(req, res) {
    try {
      const posts = await Post.find({ userId: req.params.userId })
        .populate({
          path: "likes",
          select: "username",
        })
        .populate({
          path: "commentIds",
          populate: {
            path: "userId",
            select: "username",
          },
        })
        .sort("field -createdAt"); //Sort newest first!
      res.status(200).send({ msg: "Posts by user " + posts[0].userId, posts });
    } catch (error) {
      console.error(error);
      res.status(500).send("error");
    }
  },

  async getAllWithLikesAndComments(req, res) {
    try {
      const posts = await Post.find()
        .populate("userId", "username")
        .populate({
          path: "likes",
          select: "username",
        })
        .populate({
          path: "commentIds",
          populate: {
            path: "userId",
            select: "username",
          },
        });
      res.status(200).send(posts);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },
};

module.exports = PostController;
