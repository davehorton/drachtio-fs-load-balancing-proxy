'use strict' ;

var _ = require('lodash') ;
var Cluster = require('./cluster') ;
var cluster = new Cluster() ;
var config = require('./config') ;
var offset = 0 ;

/* add the initial set of Fsw servers to the cluster */
cluster.addServer(config.targets) ;

/**
 * rotate the list of targets so that we'll round robin the requests to them
 * @param  {Array} targets - Array of Fsw
 * @return {Array} re-ordered array of Fsw to use for the current INVITE
 */
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

/**
 * proxy a request downstream
 * @param  {Request} req - drachtio Request object
 * @param  {Response} res - drachtio Response object
 */
function proxy( req, res ) {
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
}

exports = module.exports = function(srf) {

  srf.invite( proxy ) ;
  srf.register( proxy ) ;
} ;