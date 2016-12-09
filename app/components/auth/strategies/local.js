'use strict';

/**
 * Dependencies
 */
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../../user/user.service');

/**
 * Local strategy
 */
module.exports = function() {
  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password',
    passReqToCallback: true,
  }, (req, username, password, cb) => {

    //Find user by username
    User.findByUsernameAndPassword(req, username, password)
      .then(user => {
        if (!user) {
          return cb(null, false);
        }
        return cb(null, user);
      })
      .catch(cb);
  }));
};
