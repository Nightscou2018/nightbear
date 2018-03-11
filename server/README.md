# Nightbear Server

## Dev env setup

Create a local dev DB:

1. Run `docker run -d -p 5984:5984 --name nightbear-dev-couchdb apache/couchdb:2.1.1`
1. Visit http://localhost:5984/_utils/#/setup
1. Create a single node, with credentials `admin:admin`
1. Config -> CORS -> Enable CORS for all domains
1. Config -> Main config -> `couch_httpd_auth` -> `timeout` -> set value to 31556926 (a year in seconds)
1. Create a new DB called `dev`
1. Create a new DB called `test`
1. Use `export NIGHTBEAR_DB_URL=http://admin:admin@localhost:5984/dev`
1. Use `export NIGHTBEAR_TEST_DB_URL=http://admin:admin@localhost:5984/test`
1. Run `npm test` to see that everything works