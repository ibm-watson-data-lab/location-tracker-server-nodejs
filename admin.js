#!/usr/bin/env node

var cloudant = require('cloudant');
var dotenv = require('dotenv');
var express = require('express');
var fs = require('fs');
var http = require('http');
var path = require('path');
var pkg = require(path.join(__dirname, 'package.json'));
var program = require('commander');
var Q = require("q");

dotenv.load();

var app = express();

(function(app) {
  if (process.env.VCAP_SERVICES) {
    var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
    if (vcapServices.cloudantNoSQLDB && vcapServices.cloudantNoSQLDB.length > 0) {
      var service = vcapServices.cloudantNoSQLDB[0];
      if (service.credentials) {
        app.set('cloudant-location-tracker-db', cloudant({
          username: service.credentials.username,
          password: service.credentials.password,
          account: service.credentials.username,
          url: service.credentials.url
        }));
      }
    }
  }
  if (process.env.VCAP_APPLICATION) {
    var vcapApplication = JSON.parse(process.env.VCAP_APPLICATION);
    app.set('vcapApplication', vcapApplication);
  }
})(app);

program
    .version(pkg.version)
    .option('-p, --port <port>', 'Port on which to listen (defaults to 3000)', parseInt);

program
    .command('db <method>')
    .description('Create (put) or delete the database')
    .action(function(method, options) {
      var cloudant = app.get('cloudant-location-tracker-db');
      if (!cloudant) {
        console.error('No database configured');
        return;
      }
      switch (method) {
        case 'put':
          var insertPlaceDocs = false;
          createDatabase(cloudant,'lt_locations_all')
              .then(function() {
                var designDoc = {
                  _id: '_design/points',
                  language: 'javascript',
                  st_indexes: {
                    pointidx: {
                      index: 'function (doc) { if (doc.geometry && doc.geometry.coordinates) { st_index(doc.geometry); }}'
                    }
                  }
                };
                return createDesignDoc(cloudant,'lt_locations_all', designDoc);
              })
              .then(function() {
                return createDatabase(cloudant, 'lt_users');
              })
              .then(function() {
                var index = {
                  type: 'json',
                  index: {
                    fields: ['api_key']
                  }
                };
                return createIndex(cloudant,'lt_users', index);
              })
              .then(function() {
                return createDatabase(cloudant, 'lt_places');
              })
              .then(function(placesDbCreated) {
                insertPlaceDocs = placesDbCreated;
                var designDoc = {
                  _id: '_design/points',
                  language: 'javascript',
                  st_indexes: {
                    pointidx: {
                      index: 'function (doc) { if (doc.geometry && doc.geometry.coordinates) { st_index(doc.geometry); }}'
                    }
                  }
                };
                return createDesignDoc(cloudant,'lt_places', designDoc);
              })
              .then(function() {
                if (insertPlaceDocs) {
                  var obj = JSON.parse(fs.readFileSync('places.json', 'utf8'));
                  if (obj && obj.places && obj.places.length > 0) {
                    for (var i = 0; i < obj.places.length; i++) {
                      obj.places[i].created_at = new Date().getTime();
                    }
                  }
                  return insertDocs(cloudant, 'lt_places', obj.places);
                }
              }, function (err) {
                console.error("Error running admin.", err.toString());
              });
          break;
        case 'delete':
            destroyDatabase(cloudant, 'lt_locations_all')
                .then(function() {
                  return destroyDatabase(cloudant, 'lt_users');
                }, function(err) {
                  console.error("Error running admin.", err.toString());
                });
          break;
      }
    }).on('--help', function() {
  console.log('  Examples:');
  console.log();
  console.log('    $ db put');
  console.log('    $ db delete');
  console.log();
});

/**
 * Creates a database with the specified name.
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the database to create
 * @returns {*|promise}
 */
var createDatabase = function(cloudant, dbName) {
  var deferred = Q.defer();
  cloudant.db.create(dbName, function(err, body) {
    if (!err) {
      console.log('Database <' + dbName + '> created successfully.');
      deferred.resolve(true);
    }
    else {
      if (412 == err.statusCode) {
        console.log('Database <' + dbName + '> already exists.');
        deferred.resolve(false);
      }
      else {
        console.error('Error creating database <' + dbName + '>: ' + err);
        deferred.reject(err);
      }
    }
  });
  return deferred.promise;
};

/**
 * Creates a design document in the specified database.
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the database to create the design document in
 * @param designDoc - The design document definition
 * @returns {*|promise}
 */
var createDesignDoc = function(cloudant, dbName, designDoc) {
  var deferred = Q.defer();
  var db = cloudant.use(dbName);
  db.insert(designDoc, function(err, result) {
    if (!err) {
      console.log('Design doc created successfully in database <' + dbName + '>.');
      deferred.resolve(result);
    }
    else {
      if (409 == err.statusCode) {
        console.log('Design doc already exists in database <' + dbName + '>.');
        deferred.resolve(result);
      }
      else {
        console.error('Error creating design doc in database <' + dbName + '>: ' + err);
        deferred.reject(err);
      }
    }
  });
  return deferred.promise;
};

/**
 * Creates an index in the specified database.
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the database to create the index in
 * @param index - The index definition
 * @returns {*|promise}
 */
var createIndex = function(cloudant, dbName, index) {
  var deferred = Q.defer();
  cloudant.use(dbName).index(index, function(err, result) {
    if (!err) {
      console.log('Index created successfully on database <' + dbName + '>.');
      deferred.resolve(result);
    }
    else {
      if (412 == err.statusCode) {
        console.log('Index already exists on database <' + dbName + '>.');
        deferred.resolve(result);
      }
      else {
        console.error('Error creating index on database <' + dbName + '>: ' + err);
        deferred.reject(err);
      }
    }
  });
  return deferred.promise;
};

/**
 * Inserts docs in the specified database.
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the database to create the index in
 * @param docs - Array of docs to insert
 * @returns {*|promise}
 */
var insertDocs = function(cloudant, dbName, docs) {
  var deferred = Q.defer();
  cloudant.use(dbName).bulk({'docs': docs}, function(err, result) {
    if (!err) {
      console.log('Docs inserted successfully into database <' + dbName + '>.');
      deferred.resolve(result);
    }
    else {
      console.error('Error inserting docs into database <' + dbName + '>: ' + err);
      deferred.reject(err);
    }
  });
  return deferred.promise;
};


/**
 * Destroys a database with the specified name.
 * @param cloudant - An instance of cloudant
 * @param dbName - The name of the database to destroy
 * @returns {*|promise}
 */
var destroyDatabase = function(cloudant, dbName) {
  var deferred = Q.defer();
  cloudant.db.destroy(dbName, function(err, body) {
    if (!err) {
      console.log('Database <' + dbName + '> destroyed successfully.');
      deferred.resolve();
    }
    else {
      console.error('Error destroying database <' + dbName + '>: ' + err);
      deferred.reject(err);
    }
  });
  return deferred.promise;
};

program.parse(process.argv);
