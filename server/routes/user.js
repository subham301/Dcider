import express from 'express';
import bcrypt from 'bcrypt';

import auth from '../middlewares/auth';
import User from '../models/User';
import validateEmail, {
  password as validatePassword,
  userid as validateUId,
  userName as validateUserName
} from '../validation/index';

const router = express.Router();
const saltRounds = 10;

/*
  @route      POST api/users/register
  @descrp     register a user and send the jwt
  @access     public
  @bodyparm   user's email(email), user's password(password),
              user's userid(uid), user's name(name)
*/
router.post('/register', (req, res) => {
  // verify the body parameters
  if (!req.body.email || !validateEmail(req.body.email))
    return res.status(400).json({ email: 'provide a valid email' });

  if (!req.body.password || !validatePassword(req.body.password))
    return res.status(400).json({
      password:
        'password of minimum 5 characters is required and can contains upto 40 characters only'
    });

  if (!req.body.uid || !validateUId(req.body.uid))
    return res.status(400).json({
      uid:
        "this is required and can contains only alphanumeric characters and may contains underscore'_'"
    });

  if (!req.body.name || !validateUserName(req.body.name))
    return res.status(400).json({ name: 'name is required' });

  const userPromise = User.find({
    $or: [{ email: req.body.email }, { uid: req.body.uid }]
  });
  const passwordHashPromise = userPromise.then(users => {
    if (users.length > 0) {
      if (
        users[0].email === req.body.email ||
        (users.length > 1 && users[1].email === req.body.email)
      ) {
        res
          .status(400)
          .json({ email: 'email already registered. Please login!' });
        return null;
      }

      if (users[0].uid === req.body.uid) {
        res
          .status(400)
          .json({ uid: 'choose a different handle. This is already in use' });
        return null;
      }
    }
    return bcrypt.hash(req.body.password, saltRounds);
  });

  let newUser;

  // to get the result of both the promises at one place
  Promise.all([userPromise, passwordHashPromise])
    .then(([users, hashedPassword]) => {
      // check if the response is already sent or not
      if (!hashedPassword) return null;

      newUser = new User({
        name: req.body.name,
        password: hashedPassword,
        email: req.body.email,
        uid: req.body.uid
      });
      return newUser.save();
    })
    .then(result => {
      // check if the response is already sent or not
      if (!result) return;

      res.setHeader('x-auth-token', newUser.getToken());
      res.send(result);
    })
    .catch(err => {
      // Internal server error
      res.status(500).send(err);
    });
  return 0;
});

/*
  @route      POST api/users/login
  @descrp     login a user and send the jwt
  @access     public
  @bodyparm   user's email(email), user's password(password)
*/
router.post('/login', (req, res) => {
  // validate the request body details
  if (!req.body.email || !validateEmail(req.body.email))
    return res.status(400).json({ email: 'Not a valid email' });
  if (!req.body.password || !validatePassword(req.body.password))
    return res.status(400).json({ password: 'Incorrect password' });

  const userPromise = User.findOne({ email: req.body.email });
  const checkPasswordPromise = userPromise.then(user => {
    if (!user) {
      res.status(400).json({ email: 'Email not registered!' });
      return null;
    }
    return bcrypt.compare(req.body.password, user.password);
  });

  Promise.all([userPromise, checkPasswordPromise])
    .then(([user, result]) => {
      // check if the response is already sent or not
      if (result === null) return;

      if (result === false) {
        res.status(400).json({
          password: 'Incorrect password'
        });
        return;
      }

      res.setHeader('x-auth-token', user.getToken());
      res.json({
        name: user.name,
        email: user.email,
        uid: user.uid
      });
    })
    .catch(err => {
      // Internal server error
      res.status(500).send(err);
    });
  return 0;
});

/*
  @route      POST api/users/password-change
  @descrp     change the password of the current user
  @access     private
  @bodyparm   user's old password(oldPass), user's new password(newPass)
*/
router.post('/password-change', auth, (req, res) => {
  // check the body-parameters
  if (!req.body.newPass || !req.body.oldPass)
    return res
      .status(400)
      .json({ "password-fields": "Both old and new passwords are required." });

  if (!validatePassword(req.body.newPass) || !validatePassword(req.body.oldPass))
    return res
      .status(400)
      .json({ "password": "Password must be atleast 5 characters long" });

  const userPromise = User.findOne({ uid: req.user.uid });
  const passwordCheckPromise =
    userPromise.then(user => bcrypt.compare(req.body.oldPass, user.password));
  const generateHashPromise =
    passwordCheckPromise.then(passwordCheck => {
      if (!passwordCheck) {
        res.status(400).json({ "password": "password doesn't match" });
        return null;
      }

      return bcrypt.hash(req.body.newPass, saltRounds);
    });

  Promise.all([userPromise, generateHashPromise])
    .then(([user, hashedPassword]) => {
      if (!hashedPassword) {
        // response has already sent to the client
        return null;
      }

      return User.findByIdAndUpdate({ _id: user._id }, { $set: { password: hashedPassword } });
    })
    .then(result => {
      if (!result) {
        // response has already sent to the client
        return;
      }
      res.json({ 'result': 'Password updated successfully!' });
    })
    .catch(err => {
      res.status(500).send(err);
    });
});

export default router;
