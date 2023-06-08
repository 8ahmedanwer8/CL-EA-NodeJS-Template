const assert = require("chai").assert;
const createRequest = require("../index.js").createRequest;

describe("createRequest", () => {
  const jobID = "1";

  context("successful calls", () => {
    const requests = [
      {
        name: "id not supplied",
        testData: { data: { code: "101", year: "2023" } },
      },
      {
        name: "code",
        testData: { id: jobID, data: { code: "101", year: "2023" } },
      },
    ];

    requests.forEach((req) => {
      it(`${req.name}`, (done) => {
        createRequest(req.testData, (statusCode, data) => {
          assert.equal(statusCode, 200);
          assert.equal(data.jobRunID, jobID);
          assert.isNotEmpty(data.data);

          assert.isAbove(Number(data.data.length), 0);
          done();
        });
      });
    });
  });

  context("error calls", () => {
    const requests = [
      { name: "empty body", testData: {} },
      { name: "empty data", testData: { data: {} } },
      {
        name: "base not supplied",
        testData: { id: jobID, data: { year: "2023" } },
      },
      {
        name: "quote not supplied",
        testData: { id: jobID, data: { code: "101" } },
      },
      {
        name: "bad code",
        testData: { id: jobID, data: { code: "badcode", year: "2023" } },
      },
      {
        name: "bad year",
        testData: { id: jobID, data: { code: "101", year: "badyear" } },
      },
    ];

    requests.forEach((req) => {
      it(`${req.name}`, (done) => {
        createRequest(req.testData, (statusCode, data) => {
          assert.equal(statusCode, 500);
          assert.equal(data.jobRunID, jobID);
          assert.equal(data.status, "errored");
          assert.isNotEmpty(data.error);
          done();
        });
      });
    });
  });
});
