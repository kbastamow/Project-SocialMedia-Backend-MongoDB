const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path"); // Necessary to provide full path for fs unlink
const transporter = require("../config/nodemailer");
const User = require("../models/User");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
require("dotenv").config();

const PORT = process.env.PORT || 3000;

const UserController = {
  async create(req, res, next) {
    try {
      let data = req.body;
      if (req.file) {
        data = { ...req.body, image: req.file.filename }; //NOT: req.file.path!
      } else {
        //PACO: ADDED THIS ELSE, or image will be saved as "undefined"
        delete data.image; 
      }
      const password = await bcrypt.hash(req.body.password, 10);
      const user = await User.create({
        ...data,
        password: password,
        role: "user",
        confirmed: false,
      });
      const emailToken = jwt.sign(
        { email: req.body.email },
        process.env.JWT_SECRET,
        { expiresIn: '48h' }
      );
      const url = `http://localhost:${PORT}/users/confirm/${emailToken}`;
      await transporter.sendMail({
        to: req.body.email,
        subject: 'Confirmation email',
        html: `<h3>Welcome, you are one step away from registering</h3>
        <a href='${url}'>Click to confirm your email</a>
        <p>Please, confirm your email within 48h</p>`
      });
      res.status(201).send({ message: "User created", user });
    } catch (error) {
      console.error(error);
      next(error);
    }
  },

  async confirm(req, res) {
    try {
      const token = req.params.emailToken;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      await User.updateOne({ email: payload.email }, { confirmed: true });
      res.status(201).send({ message: "User confirmed" });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async login(req, res) {
    try {
      const user = await User.findOne({ email: req.body.email });
      if (!user) {
        return res.status(400).send({ message: "Incorrect user/password" });
      }
      if (!user.confirmed) {
        return res.status(400).send({ message: "Email must be confirmed first" });
      }
      const isMatch = await bcrypt.compare(req.body.password, user.password);
      if (!isMatch) {
        return res.status(400).send({ message: "Incorrect user/password" });
      }
      const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);

      if (user.tokens.length >= 4) {
        user.tokens = user.tokens.splice(user.tokens.length - 3);
      }

      user.tokens.push(token);
      await user.save();
      res.send({ token, _id: `${user._id}`, message: `Welcome ${user.username}` });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async logout(req, res) {
    try {
      const token = req.headers.authorization;
      await User.updateOne(
        { _id: req.user._id },
        { $pull: { tokens: token } },
        { new: true }
      );
      res.send({ message: "You have been logged out" });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async update(req, res) {
    try {
      let data = { ...req.body };
      if (req.body.username) {
        let usernameAlreadyTaken = await User.exists({
          username: req.body.username,
        });
        if (usernameAlreadyTaken) {
          return res.status(400).send({ message: `username ${req.body.username} already in use` });
        }
      }
      if (req.body.password) {
        const newPassword = await bcrypt.hash(req.body.password, 10);
        data.password = newPassword;
      }

      if (req.file) {
        data = { ...data, image: req.file.filename }; //Image must be req.file.filename, not req.file.path
        if (req.user.image) {
          const imagePath = path.join(__dirname, "../public/uploads/users/", req.user.image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath); //Node.js method that deletes the corresponding file
          }
        }
      } else {
        delete data.image;
      }
      delete data.email;
      const user = await User.findByIdAndUpdate(req.user._id, data, { new: true });
      res.send({ message: `User ${user.username} updated`, x: req.file, pw: data.password });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async getAll(req, res) {
    try {
      const users = await User.find();
      res.send(users);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async getById(req, res) {
    try {
      const userId = new mongoose.Types.ObjectId(req.params._id);
      const user = await User.findById({ _id: userId })
        .populate({
          path: "following",
          select: "username image",
        })
        .populate({
          path: "followers",
          select: "username image",
        });
      res.send(user);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async getByUsername(req, res) {
    try {
      const users = await User.find({
        username: { $regex: ".*" + req.params.username + ".*" },
      });
      res.send(users);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async delete(req, res) {
    try {
      const userId = new mongoose.Types.ObjectId(req.user._id);
      const user = await User.findByIdAndDelete({ _id: userId });
      // Delete _id from other users followers array
      await User.updateMany(
        { followers: userId },
        { $pull: { followers: userId } }
      );

      // Delete _id from other users following array
      await User.updateMany(
        { following: userId },
        { $pull: { following: userId } }
      );

      // Delete all posts made by the user
      await Post.deleteMany({ userId: userId });

      // Delete all likes from posts liked by the user
      await Post.updateMany({ likes: userId }, { $pull: { likes: userId } });

      // Delete all commentIds present in array Comment.likes
      await Comment.updateMany({ likes: userId }, { $pull: { likes: userId } });

      // Delete all comments made by the user that are present in Post.commentIds
      const userComments = await Comment.find({ userId: userId });
      const commentIdsToDelete = userComments.map((comment) => comment._id);

      // Only now we can delete all comments made by the user
      await Comment.deleteMany({ userId: userId });

      await Post.updateMany(
        { commentIds: { $in: commentIdsToDelete } },
        { $pull: { commentIds: { $in: commentIdsToDelete } } }
      );

      if (user.image) {
        const imagePath = path.join(
          __dirname,
          "../public/uploads/users/",
          user.image
        );
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      res.send({ message: `User ${user.username} deleted` });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async follow(req, res) {
    try {
      const followerId = req.user._id;
      const followingId = req.params.targetid;
      // update user that hits follow button
      const follower = await User.findByIdAndUpdate(followerId, {
        $push: { following: followingId },
      });
      // update the user that is being followed
      const following = await User.findByIdAndUpdate(followingId, {
        $push: { followers: followerId },
      });
      res.send({ message: `User ${follower.username} is now following ${following.username}` });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async unfollow(req, res) {
    try {
      const followerId = req.user._id;
      const followingId = req.params.targetid;
      // update user that hits UN-follow button
      const follower = await User.findByIdAndUpdate(followerId, {
        $pull: { following: followingId },
      });
      // update the user that is being UN-followed
      const following = await User.findByIdAndUpdate(followingId, {
        $pull: { followers: followerId },
      });
      res.send({
        message: `User ${follower.username} no longer follows ${following.username}`,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async recoverPassword(req, res) {
    try {
      const recoverToken = jwt.sign(
        { email: req.params.email },
        process.env.JWT_SECRET,
        { expiresIn: "48h" }
      );
      const url = `http://localhost:${PORT}/users/resetPassword/${recoverToken}`;
      await transporter.sendMail({
        to: req.params.email,
        subject: "Recover your password",
        html: `<h3>Recover your password</h3>
        <a href='${url}'>Click to recover your password</a>
        <p>This link will expire within 48h</p>`,
      });
      res.send({ message: "A recovering email was sent to your email address" });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  async resetPassword(req, res) {
    try {
      const recoverToken = req.params.recoverToken;
      const payload = jwt.verify(recoverToken, process.env.JWT_SECRET);
      const password = await bcrypt.hash(req.body.password, 10);
      await User.findOneAndUpdate(
        { email: payload.email },
        { password: password }
      );
      res.send({ message: "Your password has been updated" });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },
};

module.exports = UserController;
