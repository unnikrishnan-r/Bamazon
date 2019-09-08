require("dotenv").config();
const mysql = require("mysql");
const sha1 = require("sha1");
const inquirer = require("inquirer");
const moment = require("moment");
const colors = require("colors");
const table = require("table");

var productCatalog = [];
var loggedInStatus = false;
var loginUserId = "";
var loginUserRole = "";
var separator = "*****************************************************"
const lowInventoryStock = 5;

const checkLoginQuery = `SELECT users.user_id,user_role.user_role_name 
  FROM users 
  inner join user_role on (users.user_id = user_role.user_role_id) 
  WHERE user_name = ? AND user_password = ?`;

const createProductQuery = "INSERT INTO products SET ?";

const selectProductsQuery = `SELECT product_id, product_name,  products.dept_id, department.dept_name,
unit_price , stock_qty
from products, department
where products.dept_id = department.dept_id order by product_id`;

const lowInventoryQuery = `SELECT product_id, product_name,  products.dept_id, department.dept_name,
unit_price , stock_qty
from products, department
where products.dept_id = department.dept_id and stock_qty < ? order by product_id`;


const createSaleRecordQuery = "INSERT INTO sale_history SET ?";

const updateInventoryQuery =
    "UPDATE products SET stock_qty = ? , unit_price = ? WHERE product_id = ?";

var connection = mysql.createConnection({
    host: "localhost",
    port: 3306,
    user: "root",
    password: process.env.dbpassword,
    database: process.env.dbname
});

var welcomeQuestions = [{
    type: "list",
    message: "New users please signup, returning users please log in...",
    name: "entryAction",
    choices: [{
            name: "Log In",
            value: "entry-action-login"
        },
        {
            name: "Sign Up",
            value: "entry-action-signup"
        },
        {
            name: "Quit",
            value: "entry-action-quit"
        }
    ]
}];

var loginQuestions = [{
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

var doYouWantToContinueQuestions = [{
    type: "list",
    message: "Please choose what you wish to do",
    name: "userChoice",
    choices: [{
            name: "Continue",
            value: "user-continue"
        },
        {
            name: "Quit",
            value: "user-quit"
        }
    ]
}];

var customerPanelQuestions = [{
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

var managerPanelQuestions = [{
    type: "list",
    message: "Please choose your option",
    name: "managerChoice",
    choices: [{
            name: "Add a Product",
            value: "add-product"
        },
        {
            name: "Update Price/Stock",
            value: "update-product"
        },
        {
            name: "Low Inventory Report",
            value: "low-inventory-report"
        },
        {
            name: "Product Catalog",
            value: "product-catalog"
        }
    ]

}];

var addProductQuestions = [{
        type: "input",
        message: "Enter a name for your Product",
        name: "product_name"
    },
    {
        type: "list",
        message: "Please choose your department",
        name: "dept_id",
        choices: [{ //Replace with function to get Dept List from DB
                name: "Books",
                value: "1"
            },
            {
                name: "Toys",
                value: "1"
            }
        ]
    },
    {
        type: "input",
        message: "Enter the price of your Product",
        name: "unit_price",
        // validate: function(value) {
        //     var valid = !isNaN(parseFloat(value));
        //     return valid || 'Please enter a number';
        //   },
        //   filter: Number
    },
    {
        type: "input",
        message: "Enter current stock of your Product",
        name: "stock_qty"
    }
];

var updateProductPanelQuestions = [{
        type: "number",
        message: "Enter product ID that you are looking to update",
        name: "product_id"
    },
    {
        type: "number",
        message: "Please enter the latest inventory?",
        name: "stock_qty"
    },
    {
        type: "number",
        message: "Please enter the price of the product",
        name: "unit_price"
    },
];

function makeConnection() {
    return new Promise(resolve => {
        connection.connect(function (err) {
            if (err) throw err;
            resolve(connection.state);
        });
    });
};

async function queryTable(query, inputs) {
    return new Promise(resolve => {
        var query1 = connection.query(query, inputs, function (err, res) {
            if (err) throw err;
            resolve(res);
        });
        console.log(query1.sql);
    });
};

function inquirerPrompt(questions) {
    return new Promise(resolve => {
        inquirer
            .prompt(questions)
            .then(inquirerResponse => resolve(inquirerResponse));
    });
};

async function validateLogin(userid, password) {
    // console.log(connection)
    var connectionState = await makeConnection();
    if (connectionState == "connected") {
        var queryResult = await queryTable(checkLoginQuery, [
            userid,
            sha1(password)
        ]);
        return queryResult.length > 0 ? [queryResult[0].user_id, queryResult[0].user_role_name] :
            false;
    }
};

async function presentRoleBasedOptions(userRole) {
    switch (userRole) {
        case "CUSTOMER":
            var customerActionStatus = await customerActions();
            break;
        case "MANAGER":
            var managerActionStatus = await managerActions();
            break;
    }
};

async function customerActions() {
    var displayProducts = await showProducts();
    var customerResponse = await inquirerPrompt(customerPanelQuestions);
    var productRecord = {};
    productCatalog.forEach(element => {
        if (element.product_id == customerResponse.inputProductId) {
            productRecord = element;
        }
    });
    if (Object.keys(productRecord).length > 0) {

        var recordSaleStatus = await recordSaleTransaction(
            loginUserId,
            productRecord,
            customerResponse.inputPurchaseQty
        );

        if (recordSaleStatus == true) {
            var decrementInventory = await decrementInventoryStatus(
                productRecord.product_id,
                productRecord.stock_qty - customerResponse.inputPurchaseQty
            );
        }
    } else {
        console.log("Thats not a product that we carry.. SORRY!!")
    }
};

async function managerActions() {
    var managerResponse = await inquirerPrompt(managerPanelQuestions);

    switch (managerResponse.managerChoice) {
        case "add-product":
            var addProductStatus = await addProduct();
            break;
        case "product-catalog":
            var showProductCatalogStatus = await showProductCatalog();
            break;

        case "low-inventory-report":
            var lowInventoryStockReportStatus = await showLowInventoryReport();
            break;

        case "update-product":
            var showProductCatalogStatus = await showProductCatalog();
            var updateProductStatus = await updateProduct();
    }
}

async function recordSaleTransaction(userId, product, purchaseQty) {
    var saleRecord = {};
    saleRecord.buyer_user_id = userId;
    saleRecord.product_id = product.product_id;
    saleRecord.dept_id = product.dept_id;
    saleRecord.qty_purchased = purchaseQty;
    saleRecord.sale_price = product.unit_price;
    saleRecord.transaction_status =
        product.stock_qty >= purchaseQty ? "SOLD" : "FAILED";

    if (connection.state != "authenticated") {
        var connectionState = await makeConnection();
    }
    var queryResult = await queryTable(createSaleRecordQuery, saleRecord);
    if (saleRecord.transaction_status == "SOLD") {
        console.log(separator.green);
        console.log("");
        console.log(
            `Your purchase was successfull, total price is ${purchaseQty *
        product.unit_price}`.green.bold.underline
        );
        console.log("");
        console.log(separator.green);
        return true;
    } else {
        console.log(separator.red);
        console.log("");
        console.log(
            "We are extremely sorry, we do not have enough products to fulfil your order"
            .red.bold.underline
        );
        console.log("");
        console.log(separator.red);
        return false;
    }
};

async function decrementInventoryStatus(productId, latestQty) {
    if (connection.state != "authenticated") {
        var connectionState = await makeConnection();
    }
    var queryResult = await queryTable(updateInventoryQuery, [
        latestQty,
        productId
    ]);
    return (queryResult.affectedRows = 1 ? true : false);
};

async function showProducts() {
    if (connection.state != "authenticated") {
        var connectionState = await makeConnection();
    }
    var queryResult = await queryTable(selectProductsQuery);
    productCatalog = queryResult;
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
};

async function showProductCatalog() {
    if (connection.state != "authenticated") {
        var connectionState = await makeConnection();
    }
    var queryResult = await queryTable(selectProductsQuery);
    productCatalog = queryResult;
    var productTable = [
        ["Product Id", "Product Name", "Department", "Unit Price", "Current Stock"]
    ];
    queryResult.forEach(element => {
        productTable.push([
            element.product_id,
            element.product_name,
            element.dept_name,
            element.unit_price,
            element.stock_qty
        ]);
    });
    console.log(table.table(productTable));
    return 1;
};

async function showLowInventoryReport() {
    if (connection.state != "authenticated") {
        var connectionState = await makeConnection();
    }
    var queryResult = await queryTable(lowInventoryQuery, lowInventoryStock);
    productCatalog = queryResult;
    var productTable = [
        ["Product Id", "Product Name", "Department", "Unit Price", "Current Stock"]
    ];
    queryResult.forEach(element => {
        productTable.push([
            element.product_id,
            element.product_name,
            element.dept_name,
            element.unit_price,
            element.stock_qty
        ]);
    });
    console.log(table.table(productTable));
    return 1;
};

async function updateProduct() {
    var updateProductResponse = await inquirerPrompt(updateProductPanelQuestions);
    console.log(updateProductResponse);
    if (connection.state != "authenticated") {
        var connectionState = await makeConnection();
    }
    var queryResult = await queryTable(updateInventoryQuery, [updateProductResponse.stock_qty, updateProductResponse.unit_price, updateProductResponse.product_id]);
    if (queryResult.affectedRows == 1) {
        console.log("Product Succesfully Updated".green.bold.underline);
    } else {
        console.log("Could not find that product".red.bold.underline);
    }

};

async function addProduct() {
    var addProductResponse = await inquirerPrompt(addProductQuestions);
    if (connection.state != "authenticated") {
        var connectionState = await makeConnection();
    }
    var queryResult = await queryTable(createProductQuery, addProductResponse);
    if (queryResult.affectedRows == 1) {
        console.log("Product Succesfully Added".green.bold.underline);
    }
};

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
        loginUserId = userDetails[0];
        loginUserRole = userDetails[1];
        if (loginUserId) {
            console.log(`Logged in as ${loginUserRole}`.green.bold);
            loggedInStatus = true;
            var userRoleOperation = await presentRoleBasedOptions(loginUserRole);
            var repeatApp = await repeatApplication();
        } else {
            console.log("Login incorrect!!!".red.bold);
            var repeatApp = await repeatApplication();
            return;
        }
    } else {
        var signupResponse = await askSignupQuestion();
    }
};



async function repeatApplication() {

    do {
        var doYouWantToContinueResponse = await inquirerPrompt(doYouWantToContinueQuestions);
        connection.end();
        connection = mysql.createConnection({
            host: "localhost",
            port: 3306,
            user: "root",
            password: process.env.dbpassword,
            database: process.env.dbname
        });
        console.clear();
        if (loggedInStatus) {
            if (doYouWantToContinueResponse.userChoice == "user-continue") {
                var repeatApp1 = await presentRoleBasedOptions(loginUserRole)
            } else {
                loggedInStatus = false;
                var repeatApp1 = await applicationBrain();
            }
        } else {
            var repeatApp1 = await applicationBrain();
        }
    } while (loggedInStatus)
}

applicationBrain();