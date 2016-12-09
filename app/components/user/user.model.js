'use strict';

/**
 * Dependencies
 */
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const errors = require('meanie-express-error-handling');
const Schema = mongoose.Schema;
const ValidationError = errors.ValidationError;
const config = require('../../config');
const roles = require('../../constants/roles');

/**
 * Schemas
 */
const AddressSchema = require('./address.schema');
const FileSchema = require('../file/file.schema');

/**
 * Configuration
 */
const DEFAULT_LOCALE = config.I18N_DEFAULT_LOCALE;
const BCRYPT_ROUNDS = config.BCRYPT_ROUNDS;

/**
 * User schema
 */
const UserSchema = new Schema({

  //Personal details
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  fullName: {
    type: String,
  },
  avatar: FileSchema,
  locale: {
    type: String,
    default: DEFAULT_LOCALE,
  },

  //Contact details
  email: {
    type: String,
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  address: AddressSchema,

  //Security
  username: {
    type: String,
    trim: true,
  },
  password: {
    type: String,
    trim: true,
  },
  roles: {
    type: [{
      type: String,
      enum: Object.values(roles),
    }],
    default: [roles.USER],
  },
  isSuspended: {
    type: Boolean,
    default: false,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  lastActive: {
    type: Date,
  },
});

//Index for logging in, looking up users and finding existing usernames
UserSchema.index({username: 1}, {unique: true});

/**
 * Data pre-parser
 */
UserSchema.statics.parseData = function(data) {
  return data;
};

/**
 * Name cleaner
 */
UserSchema.statics.cleanName = function(name) {
  return name
    .replace(/\'/g, '’')
    .replace(/—/g, '-')
    .replace(/[\\\/]/g, '');
};

/**
 * Helper to create full name
 */
UserSchema.statics.createFullName = function(firstName, lastName) {
  return String(firstName + ' ' + lastName).trim();
};

/**
 * Generate a unique username based on user data
 */
UserSchema.statics.uniqueUsername = function(data) {

  //Extract data
  const {email, firstName, lastName} = data;
  const name = String(firstName + lastName).toLowerCase();

  //Random number generator 1-100
  function random() {
    return String(Math.floor(Math.random() * 100) + 1);
  }

  //Possible usernames
  const usernames = [
    name,
    name + random(),
    name + random(),
    name + random(),
    name + random(),
    name + random(),
  ];

  //Email first
  if (email) {
    usernames.unshift(email.toLowerCase());
  }

  //Find existing users
  return this
    .find({username: {$in: usernames}})
    .select('username')
    .then(users => {

      //Find first one that didn't exist
      const username = usernames.find(username => {
        return !users.some(user => user.username === username);
      });

      //Still nothing found? Give up
      if (!username) {
        throw new Error('Unable to find unique username for user');
      }

      //Return username
      return username;
    });
};

/**
 * Clean up names
 */
UserSchema.pre('save', function(next) {

  //Clean up names
  if (this.isModified('firstName')) {
    this.firstName = this.constructor.cleanName(this.firstName);
  }
  if (this.isModified('lastName')) {
    this.lastName = this.constructor.cleanName(this.lastName);
  }

  //Create full name
  if (this.isModified('firstName') || this.isModified('lastName')) {
    this.fullName = this.constructor
      .createFullName(this.firstName, this.lastName);
  }

  //Next middleware
  next();
});

/**
 * Hash password
 */
UserSchema.pre('save', function(next) {

  //Check if password modified
  if (!this.isModified('password')) {
    return next();
  }

  //Validate password
  if (!this.password) {
    return next(new ValidationError({
      fields: {
        password: {
          type: 'required',
        },
      },
    }));
  }

  //Generate salt
  bcrypt
    .genSalt(BCRYPT_ROUNDS)
    .then(salt => bcrypt.hash(this.password, salt))
    .then(hash => {
      this.password = hash;
    })
    .then(next)
    .catch(next);
});

/**
 * Email with name
 */
UserSchema.virtual('emailWithName').get(function() {
  if (!this.email) {
    return '';
  }
  if (this.fullName) {
    return this.fullName + ' <' + this.email + '>';
  }
  else if (this.firstName || this.lastName) {
    return String(this.firstName + ' ' + this.lastName).trim() +
      ' <' + this.email + '>';
  }
  return this.email;
});

/**
 * Password validation helper
 */
UserSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Has role checker
 */
UserSchema.methods.hasRole = function(role) {
  return this.roles.includes(role);
};

/**
 * Add a user role
 */
UserSchema.methods.addRole = function(role) {
  if (!this.roles.includes(role)) {
    this.roles.push(role);
  }
};

/**
 * Get claims
 */
UserSchema.methods.getClaims = function() {
  return {
    id: this._id.toString(),
    roles: this.roles,
  };
};

/**
 * Transformation to JSON
 */
UserSchema.options.toJSON = {
  transform(doc, ret) {

    //Delete sensitive data
    delete ret.password;

    //Delete unnecessary data
    delete ret.fullName;
  },
};

/**
 * Define model
 */
mongoose.model('User', UserSchema);
