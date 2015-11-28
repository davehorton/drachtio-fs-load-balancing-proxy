'use strict' ;

var Fsw = require('./fsw') ;
var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var _ = require('lodash') ;
var assert = require('assert') ;

function fswId(obj) {
  return obj.address + ':' + obj.port + ':' + obj.profile ;
}

/**
 * Cluster of freeswitch servers to proxy requests to
 */
function Cluster() {
  if (!(this instanceof Cluster)) { return new Cluster(); }

  this.pool = {} ;
  this.offset = 0 ;

  Emitter.call(this); 

}
util.inherits(Cluster, Emitter) ;

exports = module.exports = Cluster ;

/**
 * adds one or more freeswitch servers to the cluster.  Any existing servers in the cluster that are not part of the new
 * list will be removed
 * @param {Fsw~createOptions|Array} targets - freeswitch server connection options (or array of same)
 */
Cluster.prototype.addServer = function(targets) {
  assert(typeof targets === 'object' || _.isArray(targets), '\'targets\' must be a single object or array of freeswitch targets') ;

  var self = this ;
  if( !_.isArray(targets) ) {
    targets = [targets] ;
  }

  // get collection of the items to be removed (i.e., they are in current list but not in new list)
  var newIds = _.map( targets, function(t) { return fswId(t); }) ;
  var remove = _.filter( this.pool, function(fsw, id) {
    if( -1 === newIds.indexOf(id) ) { return true ;}
  }) ;

  // add any new servers
  var adds = 0 ;
  targets.forEach( function(t) {
    var id = fswId(t) ;
    if( id in self.pool) {
      console.log('Cluster#addServer: not adding target %s because it already exists', id) ;
      return ;
    }

    adds++ ;
    var fsw = new Fsw(t) ;
    self.pool[id] = fsw ;
    console.log('Cluster#addServer: adding target %s', id) ;
    fsw.connect() ;
    fsw.on('connect', self._onConnect.bind(self, fsw)) ;
    fsw.on('error', self._onError.bind(self, fsw)) ;
  }) ;

  // remove any old servers that do not appear in the new list
  remove.forEach( function(t) {
    var id = fswId(t) ;
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
  return _.filter( this.pool, function(fsw) { return fsw.connected() ;}) ;
} ;

Cluster.prototype._onError = function(fsw, err) {
  console.error('freeswitch %s emitted error: ', fswId(fsw), err) ;
  this.emit('offline', fsw.toJSON() ) ;
} ;
Cluster.prototype._onConnect = function(fsw) {
  console.error('freeswitch %s listening on %s:%d connected ok', fswId(fsw), fsw.sipAddress, fsw.sipPort) ;
  this.emit('online', fsw.toJSON() ) ;
} ;
