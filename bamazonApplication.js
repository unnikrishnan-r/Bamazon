require("dotenv").config();
const mysql = require("mysql");
const sha1 = require("sha1");
const inquirer = require("inquirer");
const moment = require("moment");
const colors = require("colors");
const table = require("table");

const checkLoginQuery = `SELECT users.user_id,user_role.user_role_name 
  FROM users 
  inner join user_role on (users.user_id = user_role.user_role_id) 
  WHERE user_name = ? AND user_password = ?`;
const createProductQuery = "INSERT INTO products SET ?";
const selectProducts = `SELECT product_id, product_name,  department.dept_name,
concat('$', format(unit_price, 2)) as "unit_price" 
from products, department
where products.dept_id = department.dept_id`;

var connection = mysql.createConnection({
  host: "localhost",
  port: 3306,
  user: "root",
  password: process.env.dbpassword,
  database: process.env.dbname
});

var welcomeQuestions = [
  {
    type: "list",
    message: "New users please signup, returning users please log in...",
    name: "entryAction",
    choices: [
      { name: "Log In", value: "entry-action-login" },
      { name: "Sign Up", value: "entry-action-signup" }
    ]
  }
];

var loginQuestions = [
  {
    type: "input",
    message: "Enter your user name",
    name: "inputUserName"
  },
  {
    type: "password",
    message: "Enter your password",
    name: "inputUserPassword"
  }
];

var customerPanelQuestions = [
  {
    type: "number",
    message: "Enter product ID that you are interested in",
    name: "inputProductId"
  },
  {
    type: "number",
    message: "How many units would you like to buy?",
    name: "inputPurchaseQty"
  }
];

function makeConnection() {
  return new Promise(resolve => {
    connection.connect(function(err) {
      if (err) throw err;
      resolve(connection.state);
    });
  });
  // return new Promise(resolve => {resolve(1+1)})
}

function queryTable(query, inputs) {
  return new Promise(resolve => {
    var query1 = connection.query(query, inputs, function(err, res) {
      if (err) throw err;
      resolve(res);
    });
    console.log(query1.sql);
  });
}

function inquirerPrompt(questions) {
  return new Promise(resolve => {
    inquirer
      .prompt(questions)
      .then(inquirerResponse => resolve(inquirerResponse));
  });
}

async function validateLogin(userid, password) {
  var connectionState = await makeConnection();
  if (connectionState == "connected") {
    var queryResult = await queryTable(checkLoginQuery, [
      userid,
      sha1(password)
    ]);
    console.log(queryResult[0]);
    return queryResult.length > 0
      ? [queryResult[0].user_id, queryResult[0].user_role_name]
      : false;
  }
}

async function presentRoleBasedOptions(userRole) {
  // console.clear();
  console.log(userRole);
  switch (userRole) {
    case "CUSTOMER":
      return await customerActions();
  }
}

async function customerActions() {
  var displayProducts = await showProducts();
  var customerResponse = await inquirerPrompt(customerPanelQuestions);
}

async function showProducts() {
  console.log(connection.state);
  if (connection.state != "authenticated") {
    var connectionState = await makeConnection();
  }
  var queryResult = await queryTable(selectProducts);
  var productTable = [
    ["Product Id", "Product Name", "Department", "Unit Price"]
  ];
  queryResult.forEach(element => {
    productTable.push([
      element.product_id,
      element.product_name,
      element.dept_name,
      element.unit_price
    ]);
  });
  console.log(table.table(productTable));
  return 1;
}

async function applicationBrain() {
  console.log("calling");
  console.clear();
  var welcomeResponse = await inquirerPrompt(welcomeQuestions);
  if (welcomeResponse.entryAction === "entry-action-login") {
    console.clear();
    var loginResponse = await inquirerPrompt(loginQuestions);
    var userDetails = await validateLogin(
      loginResponse.inputUserName,
      loginResponse.inputUserPassword
    );
    var loginUserId = userDetails[0];
    var loginUserRole = userDetails[1];
    if (loginUserId) {
      console.log("Login validated".green.bold);
      var userRoleOperation = await presentRoleBasedOptions(loginUserRole);
      console.log("123", userRoleOperation);
    } else {
      console.log("Login incorrect!!!");
      return;
    }
  } else {
    var signupResponse = await askSignupQuestion();
  }
}

applicationBrain();
