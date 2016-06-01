'use strict';

var iptables = require('iptables') ;
var blacklist = require('./blacklist-regex') ;
var _ = require('lodash') ;
var spawn = require('child_process').spawn;
var parser = require('drachtio-sip').parser ;
var assert = require('assert') ;

module.exports = function(opts) {
  assert.ok( typeof opts.chain === 'string', '\'opts.chain\' is required') ;

  var logger = opts.logger ;
  var chain  = opts.chain ;
  var realm = opts.realm ;
  var process = true ;

  // verify the chain exists
  var cmd = spawn('sudo', ['iptables','-S', chain]);
  cmd.stderr.on('data', function(buf) {
      logger.error('error listing chain %s: ', chain, String(buf)) ;
      process = false ;
  }) ;

  return function (req, res, next) {
    if( !process ) { return next(); }

    // if the request was not sent to the configured domain, silently drop it and blacklist the sender
    if( !!realm ) {
      var uri = parser.parseUri( req.uri ) ;
      if( uri.host !== realm ) {
        logger.error('received %s for incorrect domain %s; does not match %s, silently discarding and blocking %s/%s', 
          req.method, uri.host, realm, req.source_address, req.protocol) ;

          iptables.drop({
            chain: chain,
            src: req.source_address,
            dport: 5060,  //TODO: should not assume we are listening on port 5060
            protocol: req.protocol,
            sudo: true
          }) ;

        return ;
      }
    }

    var blackholed = false ;
    _.each( blacklist, function(value, key) {
      var matches = 'string' === typeof value ? [value] : value ;
      matches.forEach( function( pattern ) {
        if( blackholed || !req.has(key) ) { return; }
        if( req.get(key).match( pattern ) ) {

          logger.error('adding src %s/%s to the blacklist because of %s:%s', req.source_address, req.protocol, key, req.get(key)) ;
          iptables.drop({
            chain: chain,
            src: req.source_address,
            dport: 5060,  //TODO: should not assume we are listening on port 5060
            protocol: req.protocol,
            sudo: true
          }) ;
          blackholed = true ;
        }
      }) ;
    }); 

    if( blackholed ) { 
      // silently discard
      return ;
    }
    
    next() ;
  } ;
} ;
