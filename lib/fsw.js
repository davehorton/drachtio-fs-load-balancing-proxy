'use strict';

var esl = require('modesl') ;
var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var noop = require('node-noop').noop;
var delegate = require('delegates') ;
var assert = require('assert') ;
var async = require('async') ;

/**
 * Freeswitch server
 * @param {Fsw~createOptions} opts - configuration options
 */
function Fsw(opts) {
  if (!(this instanceof Fsw)) { return new Fsw(opts); }

  assert(typeof opts === 'object', '\'opts\' is a required argument') ;
  assert(typeof opts.address === 'string', '\'opts.address\' is a required argument') ;
  assert(typeof opts.port === 'number', '\'opts.port\' is a required argument') ;
  assert(typeof opts.secret === 'string', '\'opts.secret\' is a required argument') ;
  assert(typeof opts.profile === 'string', '\'opts.profile\' is a required argument') ;

  this.address = opts.address ;
  this.port = opts.port ;
  this.secret = opts.secret ;
  this.profile = opts.profile ;

  Object.defineProperty( this, 'id', {
    get: function() { 
      return this.address + ':' + this.port + ':' + this.profile ;
    }
  }) ;
  Object.defineProperty( this, 'idleSessions', {
    get: function() { 
      if( typeof this.maxSessions !== 'undefined' && typeof this.currentSessions !== 'undefined') {
        return this.maxSessions - this.currentSessions;
      }
    }
  }) ;

  Emitter.call(this); 

}
util.inherits(Fsw, Emitter) ;

exports = module.exports = Fsw ;

/**
 * connect to the event socket of a freeswitch server
 * @param  {Fsw~connectCallback} callback - callback invoked when connection successfully completes
 */
Fsw.prototype.connect = function( cb ) {
  var self = this ;

  cb = cb || noop ;
  this.closing = false ;

  function listener(callback, err) {
    callback(err) ;
  }

  async.series([
      function connectToFsw(callback) {
        self._conn = new esl.Connection(self.address, self.port, self.secret, function() {
          self._conn.removeListener('error', listener) ;
          callback(null) ;
        }) ;
        self._conn.once('error', listener.bind(self, callback)) ;
      }, 
      function queryProfile(callback) {
        self._conn.api('sofia status', function(res){
          var status = res.getBody() ;
          var re = new RegExp('^\\s*' + self.profile + '\\s.*sip:mod_sofia@((?:[0-9]{1,3}\\.){3}[0-9]{1,3}):(\\d+)', 'm') ;
          var results = re.exec( status ) ;
          if( null === results ) { 
            self._conn.disconnect() ;
            return callback('profile ' + self.profile + ' does not exist on freeswitch server at ' + self.address + ':' + self.port) ;
          }
          self.sipAddress = results[1] ;
          self.sipPort = parseInt( results[2] ) ;
          callback(null) ;
        }) ;
      }
    ], 
    function( err ) {
      if( err ) {
        console.error('Error connecting to freeswitch: ', err) ;
        return cb(err) ;
      }

      self._conn.on('error', self._onError.bind(self) );

      self._conn.subscribe(['HEARTBEAT']) ;
      self._conn.on('esl::event::HEARTBEAT::*', self._onHeartbeat.bind(self)) ;

      cb(null) ;
      self.emit('connect', null) ;
    }
  ) ;
} ;

Fsw.prototype.disconnect = function() {
  this.closing = true ;
  if( this._conn.connected() ) {
    this._conn.disconnect() ;
  }
} ;

Fsw.prototype._onHeartbeat = function(evt) {
  this.maxSessions = parseInt( evt.getHeader('Max-Sessions')) ;
  this.currentSessions = parseInt( evt.getHeader('Session-Count')) ;
  this.cps = parseInt( evt.getHeader('Session-Per-Sec')) ;
  this.hostname = evt.getHeader('FreeSWITCH-Hostname') ;
  this.v4address = evt.getHeader('FreeSWITCH-IPv4') ;
  this.v6address = evt.getHeader('FreeSWITCH-IPv6') ;
  this.fsVersion = evt.getHeader('FreeSWITCH-Version') ;
  this.cpuIdle = parseFloat( evt.getHeader('Idle-CPU')) ;

  console.log('%s: sessions (max/current/avail): %d/%d/%d, cpu idle: %d', this.id, this.maxSessions, 
    this.currentSessions, this.idleSessions, this.cpuIdle) ;
} ;


/**
 * This callback provides the response to a connection attempt to a freeswitch server
 * @callback Fsw~connectCallback
 */

Fsw.prototype._onError = function(err) {
    this.emit('error', err);
};

Fsw.prototype.toJSON = function() {
  return {
    address: this.address,
    port: this.port,
    profile: this.profile
  } ;
} ;

delegate(Fsw.prototype, '_conn')
  .method('connected') 
  .method('api') ;


 /**
 * Error event triggered when connection to freeswitch media server fails.
 *
 * @event Fsw#error
 * @type {object}
 * @property {String} message - Indicates the reason the connection failed
 */
