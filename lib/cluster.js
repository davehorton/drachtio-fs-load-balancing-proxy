'use strict' ;

var Fsw = require('./fsw') ;
var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var _ = require('lodash') ;
var fs = require('fs') ;
var path = require('path') ;
var assert = require('assert') ;
require("console-stamp")(console);


/**
 * A cluster of freeswitch servers that SIP requests will be proxied to
 * @constructor
 */
function Cluster() {
  if (!(this instanceof Cluster)) { return new Cluster(); }

  var self = this ;
  this.pool = {} ;

  //watch config file for changes - we allow the user to dynamically add or remove targets
  var configPath = path.resolve(__dirname) + '/config.js' ;
  fs.watchFile(configPath, function () {
    try {
      console.log('config.js was just modified...') ;

      delete require.cache[require.resolve(configPath)] ;
      var config = require(configPath) ;

      self.addServer( config.targets, config.localAddress ) ;

    } catch( err ) {
      console.log('Error re-reading config.js after modification; check to ensure there are no syntax errors: ', err) ;
    }
  }) ;

  Emitter.call(this); 

}
util.inherits(Cluster, Emitter) ;

exports = module.exports = Cluster ;

/**
 * adds one or more freeswitch servers to the cluster.  Any existing servers in the cluster that are not part of the new
 * list will be removed
 * @param {Fsw~createOptions|Array} targets - freeswitch server connection options (or array of same)
 */
Cluster.prototype.addServer = function(targets, localAddress) {
  assert(typeof targets === 'object' || _.isArray(targets), '\'targets\' must be a single object or array of freeswitch targets') ;

  var self = this ;
  if( !_.isArray(targets) ) {
    targets = [targets] ;
  }

  // get collection of the items to be removed (i.e., they are in current list but not in new list)
  var newIds = _.map( targets, function(t) { return Fsw.makeId(t); }) ;
  var remove = _.filter( this.pool, function(fsw, id) {
    if( -1 === newIds.indexOf(id) ) { return true ;}
  }) ;

  // add any new servers
  var adds = 0 ;
  targets.forEach( function(t) {
    var id = Fsw.makeId(t) ;
    if( id in self.pool) {
      console.log('Cluster#addServer: not adding target %s because it already exists', id) ;
      return ;
    }

    adds++ ;

    var opts = _.extend(t, {retry_max_delay: 60000}) ;
    if( localAddress ) { opts.localAddress = localAddress ; }

    var fsw = new Fsw(opts) ;
    self.pool[id] = fsw ;
    console.log('Cluster#addServer: adding target %s', id) ;
    fsw.connect() ;
    fsw.on('error', self._onError.bind(self, fsw)) ;
    fsw.on('offline', self._onOffline.bind( self, fsw)) ;
    fsw.on('online', self._onOnline.bind( self, fsw)) ;
    fsw.on('reconnecting', self._onReconnecting.bind(self, fsw)) ;
  }) ;

  // remove any old servers that do not appear in the new list
  remove.forEach( function(t) {
    var id = Fsw.makeId(t) ;
    console.log('Cluster#addServer: removing target %s', id) ;
    delete self.pool[id] ;
    t.removeAllListeners('error') ;
    t.disconnect() ;
  }) ;
  console.log('added %d servers and removed %d servers', adds, remove.length) ;
} ;

/**
 * get array of online freeswitch servers
 */
Cluster.prototype.getOnlineServers = function() {
  return _.filter( this.pool, function(fsw) { return fsw.online ;}) ;
} ;

Cluster.prototype._onError = function(fsw, err) {
  switch( err.code ) {
    case 'EHOSTUNREACH': 
      console.log('freeswitch %s is unreachable or down', Fsw.makeId(fsw)) ;
      break ;
    case 'ECONNREFUSED':
      break ;
    default:
       console.log('freeswitch %s emitted error: ', Fsw.makeId(fsw), err) ;
       break;
  }
} ;
Cluster.prototype._onOffline = function(fsw) {
  console.log('freeswitch %s went offline', Fsw.makeId(fsw)) ;
  this.emit('offline', fsw.toJSON() ) ;
} ;
Cluster.prototype._onOnline = function(fsw) {
  console.log('freeswitch %s went online', Fsw.makeId(fsw)) ;
  this.emit('online', fsw.toJSON() ) ;
} ;
Cluster.prototype._onReconnecting = function(fsw, obj) {
  console.log('freeswitch %s: reconnecting in %d ms (attempt #%d)', Fsw.makeId(fsw), obj.delay, obj.attempt) ;
} ;
