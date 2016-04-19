// Licensed under the Apache 2.0 License. See footer for details.

var algorithm = 'AES-256-CTR';
var crypto = require('crypto');
var request = require('request');
var uuid = require('node-uuid');
var Q = require("q");

module.exports.putUser = function(req, res) {
  var app = req.app;
  var cloudantService = app.get('cloudant-location-tracker-db');
  if (!cloudantService) {
    return res.status(500).json({ error: 'No database server configured' })
  }
  if (!req.body) {
    return res.sendStatus(400);
  }
  if (req.params.id != 'org.couchdb.user:' + req.body.name) {
    // TOOD: Better handle this error
    return res.sendStatus(400);
  }

  // When a user attempts to register we do the following:
  // 1. Check if the user exists with the specified id. If the user already exists then return a status of 409 to the client.
  // 2. Create a location database for this user and this user only
  // 3. Generate an API key/password.
  // 4. Associate the API key with the user's database.
  // 5. Store the user in the users database with their id, password, api key, and api password (encrypted).
  // 6. Configure continuous replication for the user's database to the "All Locations" database
  var dbName = 'location-tracker-' + uuid.v4();
  checkIfUserExists(cloudantService, req.params.id)
      .then(function () {
        return createDatabase(cloudantService, dbName);
      })
      .then(function () {
        return createIndexes(cloudantService, dbName);
      })
      .then(function () {
        return generateApiKey(cloudantService);
      })
      .then(function (api) {
        return applyApiKey(cloudantService, dbName, api);
      })
      .then(function (api) {
        return saveUser(req, cloudantService, dbName, api);
      })
      .then(function (user) {
        return setupReplication(cloudantService, dbName, user);
      })
      .then(function (user) {
        res.status(201).json({
          ok: true,
          id: user._id,
          rev: user.rev
        });
      }, function (err) {
        console.error("Error registering user.", err.toString());
        if (err.statusCode && err.statusMessage) {
          res.status(err.statusCode).json({error: err.statusMessage});
        }
        else {
          res.status(500).json({error: 'Internal Server Error'});
        }
      });
};

/**
 * This function checks if the user with the specified id exists in the users database.
 * @param cloudantService - An instance of cloudant
 * @param id - The id of the user to check
 * @returns a promise
 */
var checkIfUserExists = function(cloudantService, id) {
  var deferred = Q.defer();
  var usersDb = cloudantService.use('users');
  usersDb.find({
    selector: {_id: id},
    fields: ['_id']
  }, function(err, result) {
    if (err) {
      deferred.reject(err);
    }
    else {
      if (result.docs.length > 0) {
        deferred.reject({statusCode:409,statusMessage:"User already exists"});
      }
      else {
        deferred.resolve();
      }
    }
  });
  return deferred.promise;
};


/**
 * This function creates a new database in Cloudant.
 * @param cloudantService - An instance of cloudant
 * @param dbName - The name of the database to create
 * @returns a promise
 */
var createIndexes = function(cloudantService, dbName) {
  var deferred = Q.defer();
  var index = {
    _id: '_design/points',
    language: 'javascript',
    st_indexes: {
      pointidx: {
        index: 'function (doc) { if (doc.geometry && doc.geometry.coordinates) { st_index(doc.geometry); }}'
      }
    }
  };
  var locationTrackerDb = cloudantService.use(dbName);
  locationTrackerDb.insert(index, function (err, result) {
      if (err) {
        deferred.reject(err);
      }
      else {
        deferred.resolve();
      }
    });
  return deferred.promise;
};

/**
 * This function creates a new database in Cloudant.
 * @param cloudantService - An instance of cloudant
 * @param dbName - The name of the database to create
 * @returns a promise
 */
var createDatabase = function(cloudantService, dbName) {
  var deferred = Q.defer();
  cloudantService.db.create(dbName, function(err, body) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve();
    }
  });
  return deferred.promise;
};

/**
 * This function generates a new database API key.
 * @param cloudantService - An instance of cloudant
 * @returns a promise
 */
var generateApiKey = function(cloudantService) {
  var deferred = Q.defer();
  cloudantService.generate_api_key(function(err, api) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(api);
    }
  });
  return deferred.promise;
};

/**
 * This function associates an api key to a Cloudant database.
 * @param cloudantService - An instance of cloudant
 * @param dbName - The name of the database to associate the api key to
 * @param api -
 * @returns a promise
 */
var applyApiKey = function(cloudantService, dbName, api) {
  var deferred = Q.defer();
  var locationTrackerDb = cloudantService.use(dbName);
  locationTrackerDb.get_security(function(err, result) {
    if (err) {
      deferred.reject(err);
    }
    else {
      var security = result.cloudant;
      if (!security) {
        security = {};
      }
      security[api.key] = ['_reader', '_writer'];
      locationTrackerDb.set_security(security, function (err, result) {
        if (err) {
          deferred.reject(err);
        }
        else {
          deferred.resolve(api);
        }
      });
    }
  });
  return deferred.promise;
};

/**
 * This function saves a user to the users datbase.
 * @param req - The request from the client which contains the user's id and name
 * @param cloudantService - An instance of cloudant
 * @param dbName - The name of the database created for the user
 * @param apiKey - The api key generated and associated to the database
 * @param apiPassword - The api password generated and associated to the database
 * @returns a promise
 */
var saveUser = function(req, cloudantService, dbName, api) {
  var deferred = Q.defer();
  // save user in database
  var cipher = crypto.createCipher(algorithm, req.body.password);
  var encryptedApiPassword = cipher.update(api.password, 'utf8', 'hex');
  encryptedApiPassword += cipher.final('hex');
  var user = {
    _id: req.params.id,
    name: req.body.name,
    api_key: api.key,
    api_password: encryptedApiPassword,
    location_db: dbName
  };
  var usersDb = cloudantService.use('users');
  usersDb.insert(user, user._id, function (err, body) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(user);
    }
  });
  return deferred.promise;
};

/**
 * This function configures continuous replication between a user's location database
 * and the "All Locations" database.
 * @param cloudantService - An instance of cloudant
 * @param dbName - The name of the user's location database
 * @param user - The user (used for promise chaining)
 * @returns a promise
 */
var setupReplication = function(cloudantService, dbName, user) {
  var deferred = Q.defer();
  var url = cloudantService.config.url + "/_replicate";
  var source = cloudantService.config.url + "/" + dbName;
  var target = cloudantService.config.url + "/location-tracker-all";
  var json = JSON.stringify({
    source: source,
    target: target,
    continuous: true
  });
  var requestOptions = {
    headers: {'Content-Type' : 'application/json'},
    uri : url,
    body: json
  };
  request.post(requestOptions, function(err, response, body) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(user); // return the user
    }
  });
  return deferred.promise;
};

module.exports.postSession = function(req, res) {
  var app = req.app;
  var cloudantService = app.get('cloudant-location-tracker-db');
  if (!cloudantService) {
    return res.status(500).json({ error: 'No database server configured' })
  }
  if (!req.body) {
    return res.sendStatus(400);
  }
  var usersDb = cloudantService.use('users');
  usersDb.get('org.couchdb.user:' + req.body.name, function(err, body) {
    if (!err) {
      var apiKey = body.api_key;
      var apiPassword = body.api_password;
      var locationDb = body.location_db;
      var decipher = crypto.createDecipher(algorithm, req.body.password);
      var decryptedApiPassword = decipher.update(apiPassword, 'hex', 'utf8');
      decryptedApiPassword += decipher.final('utf8');
      cloudantService.auth(body.api_key, decryptedApiPassword, function(err, body, headers) {
        if (!err) {
          // TODO: This is a hack to deal with running app locally
          var cookieData = {};
          var cookieKeyValues = headers['set-cookie'][0].split(';');
          cookieKeyValues.map(function(keyValueString) {
              var keyValue = keyValueString.trim().split('=');
              cookieData[keyValue[0]] = keyValue[1];
          });
          var cookie = '';
          for (var key in cookieData) {
              switch (key) {
                  case 'AuthSession':
                      cookie += 'AuthSession=' + cookieData[key]
                      break;
                  case 'Version':
                      cookie += '; Version=' + cookieData[key]
                      break;
                  case 'Expires':
                      cookie += '; Expires=' + cookieData[key]
                      break;
                  case 'Max-Age':
                      cookie += '; Max-Age=' + cookieData[key]
                      break;
                  case 'Path':
                      cookie += '; Path=' + cookieData[key]
                      break;
                  case 'HttpOnly':
                      cookie += '; HttpOnly'
                      break;
                  case 'Secure':
                      // Intentionally not set
                      break;
              }
          }
          res.setHeader('Set-Cookie', cookie);
          res.json({
            ok: true,
            name: req.body.name,
            api_key: apiKey,
            api_password: decryptedApiPassword,
            location_db: locationDb,
            roles: body.roles
          });
        } else {
          res.status(500).json({error: 'Internal Server Error'});
        }
      });
    } else {
      res.status(500).json({error: 'Internal Server Error'});
    }
  });
};

module.exports.getSession = function(req, res) {
  var app = req.app;
  var cloudantService = app.get('cloudant-location-tracker-db');
  if (!cloudantService) {
    return res.status(500).json({ error: 'No database server configured' })
  }
  if (!req.body) {
    return res.sendStatus(400);
  }
  var vcapServices = app.get('vcapServices');
  if (!(vcapServices.cloudantNoSQLDB && vcapServices.cloudantNoSQLDB.length > 0)) {
    return res.status(500).json({error: 'No VCAP_SERVICES configured'});
  }
  var service = vcapServices.cloudantNoSQLDB[0];
  if (!service.credentials) {
    return res.status(500).json({error: 'No service credentials configured'});
  }
  var cookieCloudant = require('cloudant')({
    cookie: 'AuthSession=' + req.cookies.AuthSession,
    account: service.credentials.username
  });
  var usersDb = cloudantService.use('users');
  cookieCloudant.session(function(err, body) {
    if (!err) {
      usersDb.find({
        selector: {
          api_key: body.userCtx.name
        },
        fields: [
          'name',
          'api_key',
          'api_password',
          'location_db'
        ]
      }, function(err, result) {
        if (!err) {
          if (result.docs.length > 0) {
            body.userCtx.name = result.docs[0].name;
            body.userCtx.api_key = result.docs[0].api_key;
            body.userCtx.api_password = result.docs[0].api_password;
            body.userCtx.location_db = result.docs[0].location_db;
            res.json(body);
          } else {
            res.json(body);
          }
        } else {
          res.status(500).json({error: 'Internal Server Error'});
        }
      });
    } else {
      res.status(500).json({error: 'Internal Server Error'});
    }
  });
};

//-------------------------------------------------------------------------------
// Copyright IBM Corp. 2015
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//-------------------------------------------------------------------------------
