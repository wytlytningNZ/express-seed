'use strict';

/**
 * Dependencies
 */
const passport = require('passport');
const moment = require('moment');
const mongoose = require('mongoose');
const jwt = require('meanie-express-jwt-service');
const errors = require('meanie-express-error-handling');
const ObjectId = mongoose.Types.ObjectId;
const ServerError = errors.ServerError;
const NotAuthenticatedError = errors.NotAuthenticatedError;
const NotAuthorizedError = errors.NotAuthorizedError;
const UserSuspendedError = errors.UserSuspendedError;
const toCamelCase = require('../../helpers/transform/to-camel-case');

/**
 * Auth controller
 */
module.exports = {

  /**
   * Verify authentication
   */
  verify(req, res) {
    res.end();
  },

  /**
   * Forget a user
   */
  forget(req, res) {
    res.clearCookie('refreshToken', {
      secure: req.secure,
      httpOnly: true,
    });
    res.end();
  },

  /**
   * Token request handler
   */
  token(req, res, next) {

    //Get grant type and initialize access token
    const grantType = toCamelCase(req.body.grantType);
    const remember = !!req.body.remember;
    const secureStatus = !!req.body.secureStatus;

    /**
     * Callback handler
     */
    function authCallback(error, user) {

      //Error given?
      if (error) {
        return next(new NotAuthenticatedError(error));
      }

      //No user found?
      if (!user) {
        return next(new NotAuthenticatedError());
      }

      //User suspended?
      if (user.isSuspended) {
        return next(new UserSuspendedError());
      }

      //Set user in request and get claims
      req.me = user;
      const claims = user.getClaims();

      //Requesting secure status?
      if (secureStatus && grantType === 'password') {
        const EXPIRATION = req.app.locals.SECURE_STATUS_EXPIRATION;
        claims.secureStatus = moment()
          .add(EXPIRATION, 'seconds')
          .toJSON();
      }

      //Generate access token
      const accessToken = jwt.generate('access', claims);

      //Generate refresh token if we want to be remembered
      if (remember) {

        //Get locals
        const COOKIE_MAX_AGE = req.app.locals.REFRESH_TOKEN_COOKIE_MAX_AGE;

        //Create refresh token and set cookie
        const refreshToken = jwt.generate('refresh', user.getClaims());
        res.cookie('refreshToken', refreshToken, {
          maxAge: COOKIE_MAX_AGE * 1000, //in ms
          secure: req.secure,
          httpOnly: true,
        });
      }

      //Send response
      return res.send({accessToken});
    }

    //Handle specific grant types
    switch (grantType) {
      case 'bearer':
        passport.authenticate('bearer', authCallback)(req, res, next);
        break;
      case 'password':
        passport.authenticate('local', authCallback)(req, res, next);
        break;
      case 'refreshToken':
        passport.authenticate('refresh', authCallback)(req, res, next);
        break;
    }
  },

  /**************************************************************************
   * Middleware
   ***/

  /**
   * Ensure a user is authenticated and has specific roles
   */
  ensureAuthenticated(...roles) {
    return function(req, res, next) {

      //Get user
      const user = req.me;

      //No user present?
      if (!user) {
        return next(new NotAuthenticatedError());
      }

      //User suspended?
      if (user.isSuspended) {
        return next(new UserSuspendedError());
      }

      //Check roles
      if (roles.length && !roles.some(role => user.hasRole(role))) {
        return next(new NotAuthorizedError());
      }

      //All good
      next();
    };
  },

  /**
   * Belongs to check
   */
  belongsTo(itemKey, ownerKey, propKey, roles) {

    //Array given as prop key, assume roles
    if (Array.isArray(propKey)) {
      roles = propKey;
      propKey = undefined;
    }

    //Guess prop key if not given
    if (typeof propKey === 'undefined') {
      switch (ownerKey) {
        case 'me':
          propKey = 'user';
          break;
      }
    }

    //Still no prop key?
    if (!propKey) {
      throw new Error('Missing prop key and unknown owner key');
    }

    //Return middleware
    return function(req, res, next) {

      //Get data
      const user = req.me;
      const owner = req[ownerKey];
      const item = req[itemKey];

      //Check roles if given
      if (Array.isArray(roles) && roles.some(role => user.hasRole(role))) {
        return next();
      }

      //Must have owner
      if (typeof owner === 'undefined') {
        return next(new ServerError(
          `Owner of type ${ownerKey} has not been loaded`
        ));
      }

      //Must have item
      if (typeof item === 'undefined') {
        return next(new ServerError(
          `Item of type ${itemKey} has not been loaded`
        ));
      }

      //Must have prop key
      if (typeof item[propKey] === 'undefined') {
        return next(new ServerError(
          `Item of type ${itemKey} has no ${propKey} property`
        ));
      }

      //Get ID
      const prop = item[propKey];
      let _id = prop;

      //If it's a populated object, check ID
      if (typeof prop === 'object' && prop._id instanceof ObjectId) {
        _id = prop._id;
      }

      //Compare
      if (!owner._id.equals(_id)) {
        return next(new NotAuthorizedError());
      }

      //All good
      next();
    };
  },
};
