'use strict' ;

var drachtio = require('drachtio') ;
var app = drachtio() ;
var Srf = require('drachtio-srf') ;
var srf = new Srf(app) ;

var drachtioConnectOpts = { host: 'localhost', port: 8022, secret: 'cymru'} ;

srf.connect(drachtioConnectOpts) ;

srf.on('connect', function(err, hostport) {
  console.log('connected to drachtio listening for SIP on %s', hostport) ;
}) ;


//load routes
require('./lib/proxy')(srf) ;


