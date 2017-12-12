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

Follow the instructions below to get the Location Tracker Server up and running locally or on IBM Cloud. Once you are finished follow the instructions to download and run the [Location Tracker app](https://github.com/ibm-cds-labs/location-tracker-client-swift).

## Running on IBM Cloud

The fastest way to deploy this application to IBM Cloud is to click the **Deploy to IBM Cloud** button below.

[![Deploy to IBM Cloud](https://metrics-tracker.mybluemix.net/stats/bdba26b32f399450eba0f0583215d475/button.svg)](https://bluemix.net/deploy?repository=https://github.com/ibm-watson-data-lab/location-tracker-server-nodejs)

**Don't have an IBM Cloud account?** If you haven't already, you'll be prompted to sign up for a IBM Cloud account when you click the button.  Sign up, verify your email address, then return here and click the the **Deploy to IBM Cloud** button again. Your new credentials let you deploy to the platform and also to code online with IBM Cloud and Git. If you have questions about working in IBM Cloud, find answers in the [IBM Cloud Docs](https://www.ng.bluemix.net/docs/).

## Running Locally

Clone this project and change into the project directory:

    $ git clone https://github.com/ibm-cds-labs/location-tracker-server-nodejs.git
    $ cd location-tracker-server-nodejs

The Node.js service requires a Cloudant instance. If you haven't already done so provision a new Cloudant instance in IBM Cloud. Create a .env file in the root folder of the project. One environment variable, `VCAP_SERVICES`, is needed in order to configure your local development environment. The value of the `VCAP_SERVICES` is a string representation of a JSON object and must include a Cloudant definition called `cloudant-location-tracker-db`. Here is an example `.env` file:

    VCAP_SERVICES={"cloudantNoSQLDB": [{"name": "cloudant-location-tracker-db","label": "cloudantNoSQLDB","plan": "Lite","credentials": {"username": "your-username","password": "your-password","host": "your-host","port": 443,"url": "https://your-username:your-password@your-host"}}]}
