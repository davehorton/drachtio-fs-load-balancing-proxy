'use strict' ;

var drachtio = require('drachtio') ;
var app = drachtio() ;
var Srf = require('drachtio-srf') ;
var srf = new Srf(app) ;
var config = require('./lib/config') ;
var logger = app.logger = require('./lib/logger');
var rangeCheck = require('range_check');
var blacklist = require('./lib/blacklist') ;
var _ = require('lodash') ;

srf.connect(config.drachtioServer) ;

srf.on('connect', function(err, hostport) {
  logger.info('connected to drachtio listening for SIP on %s', hostport) ;
}) ;


function checkSender(req, res, next) {
  if( !rangeCheck.inRange( req.source_address, config.authorizedSources) ) { 
    return res.send(403) ; 
  }
  next() ;
}

/* optionally provide access control */
if( _.isArray( config.authorizedSources ) && config.authorizedSources.length > 1 ) {
  srf.use(checkSender) ;
}

// optionally detect SIP scanners and blackhole them
if( config.blacklist && config.blacklist.chain ) {
  srf.use(blacklist({logger: logger, chain: config.blacklist.chain, realm: config.blacklist.chain})) ;
}

// Expose app
exports = module.exports = app;

//load routes
require('./lib/proxy')(srf) ;


