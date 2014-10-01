/*jslint node: true */
'use strict';

var application_root = __dirname.replace(/\\/g, '/'),
    morgan = require('morgan'),
    Sequelize = require('sequelize'),
    sequelize = new Sequelize('database', 'username', 'password', {
        dialect: 'sqlite',
        storage: 'data/juiceshop.sqlite'
    }),
    restful = require('sequelize-restful'),
    express = require('express'),
    errorhandler = require('errorhandler'),
    cookieParser = require('cookie-parser'),
    serveIndex = require('serve-index'),
    favicon = require('serve-favicon'),
    bodyParser = require('body-parser'),
    expressJwt = require('express-jwt'),
    jwt = require('jsonwebtoken'),
    utils = require('./lib/utils'),
    app = express();

var secret = 'h0lyHandgr3nade';

/* Domain Model */
var User = sequelize.define('User', {
    email: Sequelize.STRING,
    password: Sequelize.STRING
});

var Product = sequelize.define('Product', {
    name: Sequelize.STRING,
    description: Sequelize.STRING,
    price: Sequelize.DECIMAL,
    image: Sequelize.STRING
});

var Basket = sequelize.define('Basket', {
});

var BasketItem = sequelize.define('BasketItems', {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    quantity: Sequelize.INTEGER
});

Basket.belongsTo(User);
Basket.hasMany(Product, {through: BasketItem});
Product.hasMany(Basket, {through: BasketItem});

var Feedback = sequelize.define('Feedback', {
    comment: Sequelize.STRING,
    rating: Sequelize.INTEGER
});

Feedback.belongsTo(User);

var Challenge = sequelize.define('Challenges', {
    description: Sequelize.STRING,
    link: Sequelize.STRING,
    solved: Sequelize.BOOLEAN
});

/* Challenges */
var redirectChallenge;

/* Data */
sequelize.drop();
sequelize.sync().success(function () {
    Challenge.create({
        description: 'Wherever you go, there you are.',
        link: 'https://www.owasp.org/index.php/Top_10_2013-A10-Unvalidated_Redirects_and_Forwards',
        solved: false
    }).success(function(challenge) {
        redirectChallenge = challenge;
    });
    User.create({
        email: 'admin@juice-sh.op',
        password: utils.hash('admin123')
    });
    User.create({
        email: 'jim@juice-sh.op',
        password: utils.hash('ncc-1701')
    });
    User.create({
        email: 'bender@juice-sh.op',
        password: utils.hash('booze')
    });
    Product.create({
        name: 'Apple Juice (1000ml)',
        description: 'The all-time classic.',
        price: 1.99,
        image: 'apple_juice.jpg'
    });
    Product.create({
        name: 'Orange Juice (1000ml)',
        description: 'Made from oranges hand-picked by Uncle Dittmeyer.',
        price: 2.99,
        image: 'orange_juice.jpg'
    });
    Product.create({
        name: 'Eggfruit Juice (500ml)',
        description: 'Now with even more exotic flavour.',
        price: 8.99,
        image: 'eggfruit_juice.jpg'
    });
    Product.create({
        name: 'Raspberry Juice (1000ml)',
        description: "Made from blended Raspberry Pi, water and sugar.",
        price: 4.99,
        image: 'raspberry_juice.jpg'
    });
    Product.create({
        name: 'Juice Shop T-Shirt (3XL)',
        description: 'Real fans wear it 24/7!',
        price: 24.99,
        image: 'fan_shirt.jpg'
    });
    Product.create({
        name: 'OWASP SSL Advanced Forensic Tool (O-Saft)',
        description: 'O-Saft is an easy to use tool to show information about SSL certificate and tests the SSL connection according given list of ciphers and various SSL configurations. <a href="https://www.owasp.org/index.php/O-Saft">More...</a>',
        price: 0.01,
        image: 'owasp_osaft.jpg'
    });
    Basket.create({
        UserId: 1
    });
    BasketItem.create({
        BasketId: 1,
        ProductId: 1,
        quantity: 2
    });
    BasketItem.create({
        BasketId: 1,
        ProductId: 2,
        quantity: 3
    });
    BasketItem.create({
        BasketId: 1,
        ProductId: 3,
        quantity: 1
    });
    Feedback.create({
        UserId: 2,
        comment: 'I love this shop! Best juice in town!',
        rating: 5
    });
});

app.use(favicon(__dirname + '/app/public/favicon.ico'));
app.use(express.static(application_root + '/app'));
app.use(morgan('combined'));
app.use(cookieParser(secret));
app.use(bodyParser.json());

/* Authorization */

/* Baskets: Unauthorized users are not allowed to access baskets */
app.use('/rest/basket', expressJwt({secret: secret}));

/* BasketItems: API only accessible for authenticated users */
app.use('/api/BasketItems', expressJwt({secret: secret}));
app.use('/api/BasketItems/:id', expressJwt({secret: secret}));

/* Feedbacks: Only POST is allowed in order to provide feedback without being logged in */
app.get('/api/Feedbacks', expressJwt({secret: secret}));
app.use('/api/Feedbacks/:id', expressJwt({secret: secret}));

/* Users: Only POST is allowed in order to register a new uer */
app.get('/api/Users', expressJwt({secret: secret}));
app.use('/api/Users/:id', expressJwt({secret: secret}));

/* Products: Only GET is allowed in order to view products */
app.post('/api/Products', expressJwt({secret: secret}));
//app.put('/api/Products/:id', expressJwt({secret: secret})); // = missing function-level access control vulnerability
app.delete('/api/Products/:id', expressJwt({secret: secret}));

/* Challenges: GET list of challenges allowed. Everything else forbidden independent of authorization */
app.post('/api/Challenges', expressJwt({secret: Math.random()}));
app.use('/api/Challenges/:id', expressJwt({secret: Math.random()}));

/* Restful APIs */
app.use(restful(sequelize, { endpoint: '/api', allowed: ['Users', 'Products', 'Feedbacks', 'BasketItems', 'Challenges'] }));

app.post('/rest/user/login', function(req, res, next){
    sequelize.query('SELECT * FROM Users WHERE email = \'' + (req.body.email || '') + '\' AND password = \'' + utils.hash(req.body.password || '') + '\'', User, {plain: true})
        .success(function(data) {
            var user = utils.queryResultToJson(data);
            if (user.data && user.data.id) {
                Basket.findOrCreate({UserId: user.data.id}).success(function(basket) {
                    var token = jwt.sign(user, secret, { expiresInMinutes: 60*5 });
                    res.json({ token: token, bid: basket.id });
                }).error(function (error) {
                    next(error);
                });
            } else {
                res.status(401).send('Invalid email or password');
            }
        }).error(function (error) {
            next(error);
        });
});

app.get('/rest/product/search', function(req, res, next){
    var criteria = req.query.q === 'undefined' ? '' : req.query.q || '';
    sequelize.query('SELECT * FROM Products WHERE name LIKE \'%' + criteria + '%\' OR description LIKE \'%' + criteria + '%\'')
        .success(function(data) {
            res.json(utils.queryResultToJson(data));
        }).error(function (error) {
            next(error);
        });
});

app.get('/rest/basket/:id', function(req, res, next){
    var id = req.params.id;
    Basket.find({where: {id: id}, include: [ Product ]})
        .success(function(data) {
            res.json(utils.queryResultToJson(data));
        }).error(function (error) {
            next(error);
        });
});

/* Static Resources */
app.use('/public/ftp', serveIndex('app/public/ftp', {'icons': true}));

app.get('/redirect', function(req, res) {
    var to = req.query.to;
    var githubUrl = 'https://github.com/bkimminich/juice-shop';
    if (to.indexOf(githubUrl) > -1) {
        if (to !== githubUrl) {
            solve(redirectChallenge);
        }
        res.redirect(to);
    } else {
        res.redirect(githubUrl);
    }
});

app.use(function (req, res, next) {
    if (req.url.indexOf('/api') !== 0 && req.url.indexOf('/rest') !== 0) {
        res.sendFile(__dirname + '/app/index.html');
    } else {
        next();
    }
});

/* Generic error handling */
app.use(errorhandler());

exports.start = function (config, readyCallback) {
    if (!this.server) {
        this.server = app.listen(config.port, function () {
            console.log('Listening on port %d', config.port);
            // callback to call when the server is ready
            if (readyCallback) {
                readyCallback();
            }
        });
    }
};

exports.close = function (exitCode) {
    this.server.close();
    if (exitCode && exitCode !== 0) {
        process.exit(exitCode);
    }
};

function solve(challenge) {
    challenge.solved = true;
    challenge.save().success(function() {
        console.log('Solved challenge "' + challenge.description + '"');
    });
}