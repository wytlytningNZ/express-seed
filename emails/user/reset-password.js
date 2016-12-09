'use strict';

/**
 * Dependencies
 */
const jwt = require('meanie-express-jwt-service');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

/**
 * Email generator
 */
module.exports = function resetPasswordEmail(req, user) {

  //Generate unique token identifier
  const jti = new ObjectId();
  const expiration = jwt.getExpiration('resetPassword');

  //Generate a password reset token
  const token = jwt.generate('resetPassword', {
    id: user._id.toString(),
    jti: jti.toString(),
  });
  const link = req.locals.appUrl + '/reset/password/' + token;
  const numHours = Math.floor(expiration / 3600);

  //Prepare data
  const to = user.email;
  const subject = 'Reset your password';
  const data = {user, link, numHours};

  //Return
  return {to, subject, data};
};
