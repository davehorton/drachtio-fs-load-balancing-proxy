'use strict' ;

var winston = require('winston') ;

var consoleLogger = new winston.transports.Console({
  level: 'debug',
  timestamp: function() {
    return new Date().toString();
  },
  colorize: true
});

module.exports = new winston.Logger({
    levels: {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    },
    transports: [ consoleLogger ]
});