var cfenv = require('cfenv');
var express = require('express');
var cloudant = require('cloudant');
var dotenv = require('dotenv');
var url = require('url');
var bodyParser = require('body-parser');

var api = require('./routes/api');

dotenv.load();

var app = express();

(function(app) {
  if (process.env.VCAP_SERVICES) {
    var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
    app.set('vcapServices', vcapServices);
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
})(app);

var jsonParser = bodyParser.json();

app.get('/api/places', jsonParser, api.getPlaces);
app.put('/api/users/:id', jsonParser, api.createUser);
app.post('/api/login', jsonParser, api.loginUser);

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function() {
  console.log("server starting on " + appEnv.url);
});