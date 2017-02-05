# Training data for Parakeet raw interpretation/calibration

Fetching a day's worth of JSON:

    GET https://nightbear.cloudant.com/user_marja/_design/global_stats/_view/per_date_and_type?limit=10000&reduce=false&include_docs=true&inclusive_end=false&start_key=%5B%222016-11-21%22%5D&end_key=%5B%222016-11-22%22%5D

Saved to file:

    orig/2016-11-21.json

Cleaned up:

    node clean > cleaned/2016-11-21.json

Combined:

    node combine > week-47.json
