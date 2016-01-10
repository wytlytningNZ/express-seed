'use strict';

/**
 * External dependencies
 */
let path = require('path');
let i18n = require('i18n');
let cors = require('cors');
let express = require('express');
let bodyParser = require('body-parser');
let compression = require('compression');
let serveStatic = require('serve-static');
let cookieParser = require('cookie-parser');

/**
 * Application dependencies
 */
let router = require('./shared/services/router');
let tokens = require('./shared/services/tokens');
let db = require('./shared/services/db');
let auth = require('./auth/auth');
let config = require('./config');

/**
 * Error handling middleware
 */
let normalizeError = require('./error/middleware/normalizeError');
let logError = require('./error/middleware/logError');
let storeError = require('./error/middleware/storeError');
let sendError = require('./error/middleware/sendError');

/**
 * Configuration
 */
const I18N_LOCALES = config.I18N_LOCALES;
const I18N_DEFAULT_LOCALE = config.I18N_DEFAULT_LOCALE;
const TOKEN_TYPES = config.TOKEN_TYPES;
const TOKEN_DEFAULT_ISSUER = config.TOKEN_DEFAULT_ISSUER;
const TOKEN_DEFAULT_AUDIENCE = config.TOKEN_DEFAULT_AUDIENCE;
const APP_BASE_URL = config.APP_BASE_URL;
const SERVER_LATENCY = config.SERVER_LATENCY;
const SERVER_LATENCY_MIN = config.SERVER_LATENCY_MIN;
const SERVER_LATENCY_MAX = config.SERVER_LATENCY_MAX;

/**
 * Export module
 */
module.exports = function() {

  //Initialize express app
  let app = express();

  //Setup database
  db(app);

  //Setup tokens
  tokens.setDefaults({
    issuer: TOKEN_DEFAULT_ISSUER,
    audience: TOKEN_DEFAULT_AUDIENCE
  });
  tokens.register(TOKEN_TYPES);

  //CORS
  app.use(cors({
    origin: APP_BASE_URL
  }));

  //Compression
  app.use(compression({
    level: 3,
    filter: function(req, res) {
      return (/json|text|javascript|css/).test(res.getHeader('Content-Type'));
    }
  }));

  //Parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({
    extended: true
  }));

  //Parse application/json
  app.use(bodyParser.json());
  app.use(bodyParser.json({
    type: 'application/vnd.api+json'
  }));

  //Add cookie parser middleware
  app.use(cookieParser());

  //Configure i18n and use 'accept-language' header to guess language settings
  i18n.configure({
    directory: 'app/locales',
    locales: I18N_LOCALES,
    defaultLocale: I18N_DEFAULT_LOCALE,
    objectNotation: true
  });
  app.use(i18n.init);

  //Set static folders
  app.use(serveStatic(path.resolve('./public')));
  app.use(serveStatic(path.resolve('./data')));

  //Simulate latency
  if (SERVER_LATENCY) {
    let latency = require('express-simulate-latency')({
      min: SERVER_LATENCY_MIN,
      max: SERVER_LATENCY_MAX
    });
    app.use(latency);
  }

  //Load authentication
  auth(app);

  //Load router
  router(app);

  //Error handlers
  app.use([
    normalizeError,
    logError,
    storeError,
    sendError
  ]);

  //Return express server instance
  return app;
};