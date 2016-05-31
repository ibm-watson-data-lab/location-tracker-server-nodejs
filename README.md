# Location Tracker Server

The Location Tracker Server is a Node.js application to be used in conjunction with the [Location Tracker app](https://github.com/ibm-cds-labs/location-tracker-client-swift).

The Location Tracker Server connects to IBM Cloudant and provides RESTful APIs for creating/managing users and creating/querying locations using [Cloudant Geo](https://docs.cloudant.com/geo.html). 

## How it works

The Location Tracker app supports offline-first, Cloudant Sync, and is implemented on a database-per-user architecture. When a user registers, a specific database is created for that user and is used to track only that user's locations. In addition, the server configures continuous replication for each user-specific database into a consolidated database where all locations can be queried. See the architecture diagram below for more information:

![Architecture of Location Tracker](http://developer.ibm.com/clouddataservices/wp-content/uploads/sites/47/2016/05/locationTracker2ArchDiagram1.png)

When you install the Location Tracker Server three databases will be created in your Cloudant instance:

![Location Tracker Cloudant](http://developer.ibm.com/clouddataservices/wp-content/uploads/sites/47/2016/05/locationTracker2Cloudant.png)

1. lt_locations_all - This database is used to keep track of all locations. When a user registers, a specific database will be created to track locations for that user. Each user-specific database will be configured to continuously replicate into the lt_locations_all database.
2. lt_places - This database contains a list of places that the Location Tracker app will query.
3. lt_users - This database is used to manage users. Each user will have a username, password and information regarding the location database for that specific user.

The `lt_locations_all` and `lt_places` database will each be created with a geo index allowing you to make geo queries and take advantage of the integrated map visuals in the Cloudant Dashboard. The `lt_places` database will be populated with 50 sample places that follow the path of the "Freeway Drive" debug location setting in the iOS simulator:
 
 ![Location Tracker Sample Places](http://developer.ibm.com/clouddataservices/wp-content/uploads/sites/47/2016/05/locationTracker2CloudantPlaces2.png)

Follow the instructions below to get the Location Tracker Server up and running locally or on Bluemix. Once you are finished follow the instructions to download and run the [Location Tracker app](https://github.com/ibm-cds-labs/location-tracker-client-swift).

## Running on Bluemix

The fastest way to deploy this application to Bluemix is to click the **Deploy to Bluemix** button below.

[![Deploy to Bluemix](https://deployment-tracker.mybluemix.net/stats/80a8bacd2fb80421a53e8d18fdbc64f1/button.svg)](https://bluemix.net/deploy?repository=https://github.com/ibm-cds-labs/location-tracker-server-nodejs)

**Don't have a Bluemix account?** If you haven't already, you'll be prompted to sign up for a Bluemix account when you click the button.  Sign up, verify your email address, then return here and click the the **Deploy to Bluemix** button again. Your new credentials let you deploy to the platform and also to code online with Bluemix and Git. If you have questions about working in Bluemix, find answers in the [Bluemix Docs](https://www.ng.bluemix.net/docs/).

## Running Locally

Clone this project and change into the project directory:

    $ git clone https://github.com/ibm-cds-labs/location-tracker-server-nodejs.git
    $ cd location-tracker-server-nodejs

The Node.js service requires a Cloudant instance. If you haven't already done so provision a new Cloudant instance in Bluemix. Create a .env file in the root folder of the project. One environment variable, `VCAP_SERVICES`, is needed in order to configure your local development environment. The value of the `VCAP_SERVICES` is a string representation of a JSON object and must include a Cloudant definition called `cloudant-location-tracker-db`. Here is an example `.env` file:

    VCAP_SERVICES={"cloudantNoSQLDB": [{"name": "cloudant-location-tracker-db","label": "cloudantNoSQLDB","plan": "Shared","credentials": {"username": "your-username","password": "your-password","host": "your-host","port": 443,"url": "https://your-username:your-password@your-host"}}]}

Install the project's dependencies (NOTE: make sure you have a Cloudant instance and .env file configured properly before running this step):

    $ npm install

Start the Node.js server by running:

    $ npm start

### Deploying to IBM Bluemix

You can deploy the Location Tracker Server to Bluemix from your local instance using the Cloud Foundry command line interface. If you haven't already, follow these steps to get the Cloud Foundry CLI installed and configured:

1. [Install the Cloud Foundry command line interface.](https://www.ng.bluemix.net/docs/#starters/install_cli.html)
2. Follow the instructions at the above link to connect to Bluemix.
3. Follow the instructions at the above link to log in to Bluemix.

Create a Cloudant service within Bluemix if one has not already been created:

    $ cf create-service cloudantNoSQLDB Shared cloudant-location-tracker-db

To deploy to Bluemix run the following command:

    $ cf push

**Note:** You may notice that Bluemix assigns a URL to your app containing a random word. This is defined in the `manifest.yml` file. The `host` key in this file contains the value `cloudant-location-tracker-${random-word}`. The random word is there to ensure that multiple people deploying the Location Tracker application to Bluemix do not run into naming collisions. However, this will cause a new route to be created for your application each time you deploy to Bluemix. To prevent this from happening, replace `${random-word}` with a hard coded (but unique) value.

## Privacy Notice

The Location Tracker sample web application includes code to track deployments to [IBM Bluemix](https://www.bluemix.net/) and other Cloud Foundry platforms. The following information is sent to a [Deployment Tracker](https://github.com/cloudant-labs/deployment-tracker) service on each deployment:

* Application Name (`application_name`)
* Space ID (`space_id`)
* Application Version (`application_version`)
* Application URIs (`application_uris`)

This data is collected from the `VCAP_APPLICATION` environment variable in IBM Bluemix and other Cloud Foundry platforms. This data is used by IBM to track metrics around deployments of sample applications to IBM Bluemix to measure the usefulness of our examples, so that we can continuously improve the content we offer to you. Only deployments of sample applications that include code to ping the Deployment Tracker service will be tracked.

### Disabling Deployment Tracking

Deployment tracking can be disabled by removing `./admin.js track && ` from the `install` script line of the `scripts` section within `package.json`.

## License

Licensed under the [Apache License, Version 2.0](LICENSE.txt).
