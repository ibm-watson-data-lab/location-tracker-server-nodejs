# Location Tracker Server

The Location Tracker Server is a Node.js application to be used in conjunction with the [Location Tracker app](https://github.com/ibm-cds-labs/location-tracker-swift).

The Location Tracker Server connects to IBM Cloudant and provides RESTful APIs for creating/managing users and creating/querying locations using [Cloudant Geo](https://docs.cloudant.com/geo.html). 

## How it works

The Location Tracker app supports offline-first, Cloudant Sync, and is implemented on a database-per-user architecture. When a user registers, a specific database is created for that user and is used to track only that user's locations. In addition, the server configures continuous replication for each user-specific database into a consolidated database where all locations can be queried (location_tracker_all). See the architecture diagram below for more information.

### Architecture Diagram

![Architecture of Location Tracker](http://developer.ibm.com/clouddataservices/wp-content/uploads/sites/47/2016/05/locationTracker2ArchDiagram1Sm.png)

## Running on Bluemix

The fastest way to deploy this application to Bluemix is to click the **Deploy to Bluemix** button below.

[![Deploy to Bluemix](https://deployment-tracker.mybluemix.net/stats/eff5ff771f3cfd9e9443463c383565a1/button.svg)](https://bluemix.net/deploy?repository=https://github.com/ibm-cds-labs/location-tracker-server-nodejs)

**Don't have a Bluemix account?** If you haven't already, you'll be prompted to sign up for a Bluemix account when you click the button.  Sign up, verify your email address, then return here and click the the **Deploy to Bluemix** button again. Your new credentials let you deploy to the platform and also to code online with Bluemix and Git. If you have questions about working in Bluemix, find answers in the [Bluemix Docs](https://www.ng.bluemix.net/docs/).

## Running Locally

Get the project and change into the project directory:

    $ git clone https://github.com/ibm-cds-labs/location-tracker-server-nodejs.git
    $ cd location-tracker-server-nodejs

Local configuration is done through a `.env` file. One environment variable, `VCAP_SERVICES`, is needed in order to configure your local development environment. The value of the `VCAP_SERVICES` is a string representation of a JSON object. Here is an example `.env` file:

    VCAP_SERVICES={"cloudantNoSQLDB": [{"name": "cloudant-location-tracker-db","label": "cloudantNoSQLDB","plan": "Shared","credentials": {"username": "your-username","password": "your-password","host": "your-host","port": 443,"url": "https://your-username:your-password@your-host"}}]}

**Note:**  Services created within Bluemix are automatically added to the `VCAP_SERVICES` environment variable. Therefore, no configuration is needed for Bluemix.

Install the project's dependencies:

    $ npm install

Run the project through [Foreman](https://github.com/ddollar/foreman):

    $ npm start

## Configuring IBM Bluemix

Complete these steps first if you have not already:

1. [Install the Cloud Foundry command line interface.](https://www.ng.bluemix.net/docs/#starters/install_cli.html)
2. Follow the instructions at the above link to connect to Bluemix.
3. Follow the instructions at the above link to log in to Bluemix.

Create a Cloudant service within Bluemix if one has not already been created:

    $ cf create-service cloudantNoSQLDB Shared cloudant-location-tracker-db

## Deploying

To deploy to Bluemix, simply:

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
