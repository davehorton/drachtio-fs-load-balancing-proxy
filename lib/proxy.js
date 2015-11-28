'use strict' ;

var _ = require('lodash') ;
var Cluster = require('./cluster') ;
var cluster = new Cluster() ;
var config = require('./config') ;
var offset = 0 ;

cluster.addServer(config.targets) ;

function shiftTargets( targets ) {
  if( offset >= targets.length ) { offset = 0 ;}
  if( targets.length <= 1) { return targets; }

  for( var i = 0; i < offset; i++ ) {
    var fsw = targets.shift() ;
    targets.push( fsw ) ;
  }
  offset++ ;
  return targets ;
}

exports = module.exports = function(srf) {

  srf.invite( function( req, res ) {

    //this is just to round robin across the servers
    var targets = shiftTargets( cluster.getOnlineServers() ) ;
    if( 0 === targets.length ) {
      console.error('returning 480 as there are no online servers') ;
      return res.send(480) ;
    }

    var dest = _.map( targets, function(t) { return t.sipAddress + ':' + (t.sipPort || 5060); }) ;
    req.proxy({
      remainInDialog: false,
      handleRedirects: true,
      provisionalTimeout: '1s',
      destination: dest
    }, function(err) {
      if( err ) { 
        console.error('Error proxying request: ', err) ;
      }
    }) ;
  }) ;
} ;