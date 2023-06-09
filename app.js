const createRequest = require("./index").createRequest;

const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const port = process.env.EA_PORT || 8080;

app.use(bodyParser.json());
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST");
  next();
});

app.post("/", (req, res) => {
  console.log("POST Data: ", req.body);
  createRequest(req.body, (status, result) => {
    console.log("Result: ", result);
    res.status(status).json(result);
  });
});

app.listen(port, () => console.log(`Listening on port ${port}!`));
