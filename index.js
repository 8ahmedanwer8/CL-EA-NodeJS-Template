const { Requester, Validator } = require("@chainlink/external-adapter");
require("dotenv").config();
const { unitsOfMeasure, commodityCodes } = require("./constants");
// Define custom error scenarios for the API.
// Return true for the adapter to retry.
const customError = (data) => {
  if (data.Response === "Error") return true;
  return false;
};

// Define custom parameters to be used by the adapter.
// Extra parameters can be stated in the extra object,
// with a Boolean value indicating whether or not they
// should be required.
const customParams = {
  year: ["year", "marketYear"],

  endpoint: false,
};

const sortArrayByYearDescending = (data) => {
  let dataArray = Object.keys(data).map((key) => {
    let [year, month] = key.split("-").map(Number);
    month -= 1;
    return {
      date: new Date(year, month),
      ...data[key],
      dateString: key,
    };
  });

  dataArray.sort((a, b) => b.date - a.date);

  dataArray = dataArray.slice(0, 6);

  const output = dataArray.map(({ dateString, grossNewSales, unitName }) => ({
    date: dateString,
    grossNewSales,
    unitName,
  }));

  return output;
};

const createRequest = (input, callback) => {
  // The Validator helps you validate the Chainlink request data
  const validator = new Validator(callback, input, customParams);
  const jobRunID = validator.validated.id;
  const year = validator.validated.data.year.toUpperCase();

  const appid = process.env.API_KEY;

  const headers = {
    Accept: "application/json",
    API_KEY: appid,
  };

  // This is where you would add method and headers
  // you can add method like GET or POST and add it to the config
  // The default is GET requests
  // method = 'get'
  // headers = 'headers.....'
  const promiseArray = [];
  Object.keys(commodityCodes).forEach((code) => {
    const url = `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/${code}/allCountries/marketYear/${year}`;
    const config = {
      url,
      params: { code, year },
      headers,
    };
    promiseArray.push(Requester.request(config, customError));
  });

  // The Requester allows API calls be retry in case of timeout
  // or connection failure
  Promise.all(promiseArray)
    .then((response) => {
      const joinedList = [];
      // It's common practice to store the desired value at the top-level
      // result key. This allows different adapters to be compatible with
      // one another.
      // response.data.result = Requester.validateResultNumber(response.data, [
      //   "main",
      // ]);
      response.forEach((res) => {
        const { data } = res;
        const massagedData = {};
        const { commodityCode } = data[0];
        const name = commodityCodes[commodityCode].commodityName;

        for (const d of data) {
          const { grossNewSales, weekEndingDate, unitId } = d;
          const monthIdx = new Date(weekEndingDate).getMonth();
          const year = new Date(weekEndingDate).getFullYear();
          const key = `${year}-${monthIdx + 1}`;
          if (!massagedData[key]) {
            massagedData[key] = {
              grossNewSales: 0,
              unitName: unitsOfMeasure[unitId],
            };
          }
          massagedData[key].grossNewSales += grossNewSales;
        }
        joinedList.push({
          commodityCode,
          commodityName: name,
          data: sortArrayByYearDescending(massagedData),
        });
      });

      const resp = {
        data: joinedList,
      };

      callback(200, Requester.success(jobRunID, resp));
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
