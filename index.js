const { Requester, Validator } = require("@chainlink/external-adapter");
const dotenv = require("dotenv");
dotenv.config();
const customError = (data) => {
  if (data.Response === "Error") return true;
  return false;
};

const customParams = {
  // commodityCode: ["code", "commodity_code"],
  endpoint: false,
};

//example https://apps.fas.usda.gov/OpenData/api/psd/commodity/0224200/dataReleaseDates
//https://apps.fas.usda.gov/OpenData/api/psd/commodities basic get

//command is Invoke-RestMethod -Method Post -Uri "http://localhost:8080/" -ContentType "application/json" -Body '{"id": 0, "data": {"commodityCode": "12388"}}'
const createRequest = (input, callback) => {
  // The Validator helps you validate the Chainlink request data
  const validator = new Validator(callback, input, customParams);
  const jobRunID = validator.validated.id;
  // const endpoint = validator.validated.data.endpoint || "price";
  const endpoint = validator.validated.data.endpoint || "commodities";

  // const url = `https://min-api.cryptocompare.com/data/${endpoint}`;
  const url = `https://apps.fas.usda.gov/OpenData/api/psd/${endpoint}`;
  // const code = validator.validated.data.commodityCode.toUpperCase();
  const appid = process.env.API_KEY;

  const headers = {
    Accept: "application/json",
    API_KEY: appid,
  };
  const config = {
    url,
    headers,
  };

  // The Requester allows API calls be retry in case of timeout
  // or connection failure
  Requester.request(config, customError)
    .then((response) => {
      callback(response.status, Requester.success(jobRunID, response));
    })
    .catch((error) => {
      callback(500, Requester.errored(jobRunID, error));
    });
};

// This is a wrapper to allow the function to work with
// GCP Functions
exports.gcpservice = (req, res) => {
  createRequest(req.body, (statusCode, data) => {
    res.status(statusCode).send(data);
  });
};

// This is a wrapper to allow the function to work with
// AWS Lambda
exports.handler = (event, context, callback) => {
  createRequest(event, (statusCode, data) => {
    callback(null, data);
  });
};

// This is a wrapper to allow the function to work with
// newer AWS Lambda implementations
exports.handlerv2 = (event, context, callback) => {
  createRequest(JSON.parse(event.body), (statusCode, data) => {
    callback(null, {
      statusCode: statusCode,
      body: JSON.stringify(data),
      isBase64Encoded: false,
    });
  });
};

// This allows the function to be exported for testing
// or for running in express
module.exports.createRequest = createRequest;
