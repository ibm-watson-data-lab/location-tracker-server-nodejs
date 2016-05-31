var algorithm = 'AES-256-CTR';
var crypto = require('crypto');
var request = require('request');
var Q = require("q");
var querystring = require("querystring");
var wurl = require('wurl');

/**
 * Gets a list of places based on the geo query passed in the request. Example request:
 * /api/places?lat=37.49453457&lon=-122.30464079&radius=4023.35&relation=contains&nearest=true&include_docs=true
 * @param req - The request from the client which contains the geo query
 * @param res - The response to be sent to the client
 * @returns {*}
 */
module.exports.getPlaces = function(req, res) {
  var app = req.app;
  var cloudant = app.get('cloudant-location-tracker-db');
  if (!cloudant) {
    return res.status(500).json({ error: 'No database server configured' })
  }
  // Call the Cloudant HTTP API directly as the cloudant-nodejs library
  // does not currently support querying geo indexes.
  var url = cloudant.config.url + "/lt_places/_design/points/_geo/pointidx";
  url += "?" + querystring.stringify(req.query);
  request.get({uri:url}, function(err, response, body) {
    if (err) {
      res.status(500).json({error: 'Internal Server Error'});
    }
    else {
      var obj = null;
      if (body) {
        obj = JSON.parse(body);
      }
      res.json(obj);
    }
  });
};

/**
 * Logs in the user. Returns the name of the location database associated with the user
 * along with the api key and password, and the cloudant account (for device/cloudant sync).
 * @param req - The request from the client which contains the user's username and password
 * @param res - The response to be sent to the client
 * @returns {*}
 */
module.exports.loginUser = function(req, res) {
  var app = req.app;
  var cloudant = app.get('cloudant-location-tracker-db');
  if (!cloudant) {
    return res.status(500).json({ error: 'No database server configured' })
  }
  if (!req.body) {
    return res.sendStatus(400);
  }
  var usersDb = cloudant.use('lt_users');
  usersDb.get(req.body.username, function(err, user) {
    if (!err) {
      if (app.get('envoy-enabled')) {
        res.json({
          ok: true,
          api_key: req.body.username,
          api_password: sha1(req.body.username),
          location_db_name: app.get('envoy-db-name'),
          location_db_host: app.get('envoy-host')
        });
      }
      else {
        var apiKey = user.api_key;
        var apiPassword = user.api_password;
        var locationDb = user.location_db;
        var decipher = crypto.createDecipher(algorithm, req.body.password);
        var decryptedApiPassword = decipher.update(apiPassword, 'hex', 'utf8');
        decryptedApiPassword += decipher.final('utf8');
        cloudant.auth(user.api_key, decryptedApiPassword, function (err, body, headers) {
          if (!err) {
            var hostname = wurl('hostname', cloudant.config.url);
            res.json({
              ok: true,
              api_key: apiKey,
              api_password: decryptedApiPassword,
              location_db_name: locationDb,
              location_db_host: hostname
            });
          }
          else {
            res.status(500).json({error: 'Internal Server Error'});
          }
        });
      }
    }
    else {
      res.status(500).json({error: 'Internal Server Error'});
    }
  });
};

function sha1(string) {
  return crypto.createHash('sha1').update(string).digest('hex');
}

/**
 * Creates a new user along with a location database specifically for that user.
 * Sets up continuous replication between the user's location database and the lt_locations_all database.
 * @param req - The request from the client which contains the user's registration information
 * @param res - The response to be sent to the client
 * @returns {*}
 */
module.exports.createUser = function(req, res) {
  var cloudant = req.app.get('cloudant-location-tracker-db');
  if (!cloudant) {
    return res.status(500).json({ error: 'No database server configured' })
  }
  if (!req.body) {
    return res.sendStatus(400);
  }
  var username = req.params.id;
  if (req.app.get('envoy-enabled')) {
    checkIfUserExists(cloudant, req.params.id)
        .then(function () {
          return saveUser(req, cloudant);
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
  }
  else {
    // When a user attempts to register we do the following:
    // 1. Check if the user exists with the specified id. If the user already exists then return a status of 409 to the client.
    // 2. Create a location database for this user and this user only (database-per-user).
    // 3. Generate an API key/password.
    // 4. Associate the API key with the newly created location database.
    // 5. Store the user in the users database with their id, password, api key, and api password (encrypted).
    // 6. Configure continuous replication for the user's location database to the "All Locations" database.
    var dbName = 'lt_locations_user_' + encodeURIComponent(username);
    checkIfUserExists(cloudant, req.params.id)
        .then(function () {
          return createDatabase(cloudant, dbName);
        })
        .then(function () {
          return createIndexes(cloudant, dbName);
        })
        .then(function () {
          return generateApiKey(cloudant);
        })
        .then(function (api) {
          return applyApiKey(cloudant, dbName, api);
        })
        .then(function (api) {
          return saveUser(req, cloudant, dbName, api);
        })
        .then(function (user) {
          return setupReplication(cloudant, dbName, user);
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
  }
};

/**
 * Checks if the user with the specified id exists in the users database.
 * @param cloudant - An instance of cloudant
 * @param id - The id of the user to check
 * @returns {*|promise}
 */
var checkIfUserExists = function(cloudant, id) {
  var deferred = Q.defer();
  var usersDb = cloudant.use('lt_users');
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
 * Creates geo indexes for the specified database.
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the database
 * @returns {*|promise}
 */
var createIndexes = function(cloudant, dbName) {
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
  var locationTrackerDb = cloudant.use(dbName);
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
 * Creates a new database in Cloudant.
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the database to create
 * @returns {*|promise}
 */
var createDatabase = function(cloudant, dbName) {
  var deferred = Q.defer();
  cloudant.db.create(dbName, function(err, body) {
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
 * Generates a new database API key.
 * @param cloudant - An instance of cloudant
 * @returns {*|promise}
 */
var generateApiKey = function(cloudant) {
  var deferred = Q.defer();
  cloudant.generate_api_key(function(err, api) {
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
 * Associates an api key to a Cloudant database.
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the database to associate the api key to
 * @param api - The api object which contains the api key and password
 * @returns {*|promise}
 */
var applyApiKey = function(cloudant, dbName, api) {
  var deferred = Q.defer();
  var locationTrackerDb = cloudant.use(dbName);
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
 * Saves a user to the lt_users database.
 * @param req - The request from the client which contains the user's id and password
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the location database created for the user
 * @param apiKey - The api key generated and associated to the location database
 * @param apiPassword - The api password generated and associated to the database
 * @returns {*|promise}
 */
var saveUser = function(req, cloudant, dbName, api) {
  var deferred = Q.defer();
  // save user in database
  var user;
  if (req.app.get('envoy-enabled')) {
    user = {
      _id: req.params.id,
      username: req.params.id
    };
  }
  else {
    var cipher = crypto.createCipher(algorithm, req.body.password);
    var encryptedApiPassword = cipher.update(api.password, 'utf8', 'hex');
    encryptedApiPassword += cipher.final('hex');
    user = {
      _id: req.params.id,
      username: req.params.id,
      api_key: api.key,
      api_password: encryptedApiPassword,
      location_db: dbName
    };
  }
  var usersDb = cloudant.use('lt_users');
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
 * Configures continuous replication between a user's location database
 * and the lt_locations_all database.
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the user's location database
 * @param user - The user (used for promise chaining)
 * @returns {*|promise}
 */
var setupReplication = function(cloudant, dbName, user) {
  var deferred = Q.defer();
  var url = cloudant.config.url + "/_replicate";
  var source = cloudant.config.url + "/" + dbName;
  var target = cloudant.config.url + "/lt_locations_all";
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
