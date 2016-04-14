// Licensed under the Apache 2.0 License. See footer for details.

var crypto = require('crypto'),
    algorithm = 'AES-256-CTR';
var request = require('request');
var uuid = require('node-uuid');

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

  // TODO: check if user exists

  // generate api key
  // create a database for this user
  var dbName = 'location-tracker-' + uuid.v4();
  cloudantService.db.create(dbName, function(err, body) {
    if (err) {
      console.error('Error creating location tracker database');
      res.status(500).json({error: 'Internal Server Error'});
    }
    else {

      cloudantService.generate_api_key(function(err, api) {
        if (err) {
          console.error('Error generating API Key');
          res.status(500).json({error: 'Internal Server Error'});
        }
        else {

          // TODO: add indexes?

          // grant access to api key to newly created database
          var locationTrackerDb = cloudantService.use(dbName);
          locationTrackerDb.get_security(function(err, result) {
            var security = result.cloudant;
            if (! security) {
              security = {};
            }
            security[api.key] = ['_reader', '_writer'];
            locationTrackerDb.set_security(security, function(err, result) {
              if (err) {
                console.error(err);
                res.status(500).json({error: 'Internal Server Error'});
              }
              else {

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
                    console.error(err);
                    res.status(500).json({error: 'Internal Server Error'});
                  }
                  else {
                    var url = cloudantService.config.url + "/_replicate";
                    var source = cloudantService.config.url + "/" + dbName;
                    var target = cloudantService.config.url + "/location-tracker-all";
                    setupReplication(url, source, target, function(err, response, body) {
                      if (err) {
                        console.error(err);
                        res.status(500).json({error: 'Internal Server Error'});
                      }
                      else {
                        res.status(201).json({
                          ok: true,
                          id: user._id,
                          rev: body.rev
                        });
                      }
                    });
                  }
                });
              }
            });
          });
        }
      });
    }
  });
};

var setupReplication = function(url, source, target, callback) {
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
  request.post(requestOptions, callback);
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
