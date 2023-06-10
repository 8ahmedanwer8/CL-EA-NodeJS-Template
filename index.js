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

  dataArray = dataArray.slice(1, 7);

  const output = dataArray.map(({ dateString, grossNewSales, unitName }) => ({
    date: dateString,
    grossNewSales,
    unitName,
  }));

  return output;
};

const cumulativeChange = (monthlyData) => {
  const data = monthlyData;
  // Reverse the data array to process in reverse time order
  const reversedData = data.reverse();

  // Calculate the percentage change between each data point
  const changes = reversedData.map((item, index) => {
    if (index === 0) {
      return 0.0; // The first data point doesn't have a change
    }
    var previousValue = reversedData[index - 1].grossNewSales;
    const currentValue = item.grossNewSales;
    if (previousValue === 0) {
      previousValue = 1; // Handle divide by zero case
    }
    return (currentValue - previousValue) / previousValue;
  });

  // Normalize the changes to a range of 0.0 to 1.0
  const minValue = Math.min(...changes);
  const maxValue = Math.max(...changes);
  const normalizedChanges = changes.map(
    (change) => (change - minValue) / (maxValue - minValue)
  );

  // Sum up the normalized changes
  const sum = normalizedChanges.reduce(
    (accumulator, currentValue) => accumulator + currentValue,
    0
  );

  // Calculate the average
  const average = sum / normalizedChanges.length;

  return average;
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
        const sortedByYear = sortArrayByYearDescending(massagedData);
        console.log(sortedByYear, "ahmed");
        joinedList.push({
          commodityCode,
          commodityName: name,
          data: sortedByYear,
          cumulativeChange: cumulativeChange(sortedByYear),
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
