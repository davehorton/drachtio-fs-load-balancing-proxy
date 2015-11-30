'use strict';

var esl = require('modesl') ;
var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var delegate = require('delegates') ;
var assert = require('assert') ;
var async = require('async') ;

/**
 * an individual Freeswitch server
 * @constructor
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
  this.localAddress = opts.localAddress ;
  this.online = false ;

  this.max_attempts = null;
  if (opts.max_attempts && !isNaN(opts.max_attempts) && opts.max_attempts > 0) {
      this.max_attempts = +opts.max_attempts;
  }
  this.retry_max_delay = null;
  if (opts.retry_max_delay !== undefined && !isNaN(opts.retry_max_delay) && opts.retry_max_delay > 0) {
      this.retry_max_delay = opts.retry_max_delay;
  }  
  this.initialize_retry_vars() ;

  Object.defineProperty( this, 'id', {
    get: function() { 
      return Fsw.makeId(this) ;
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

Fsw.makeId = function(obj) {
  return obj.address + ':' + obj.port + ':' + obj.profile ;
} ;

/**
 * connect to the event socket of a freeswitch server, validate the configured sip profile exists, 
 * and begin receving heartbeat messages
 * @param  {Fsw~connectCallback} callback - callback invoked when connection successfully completes
 */
Fsw.prototype.connect = function() {
  var self = this ;

  this.closing = false ;

  async.series([
      function connectToFsw(callback) {
        self._conn = new esl.Connection(self.address, self.port, self.secret, self.localAddress) ;
        
        self._conn
        .on('esl::ready', function() { return callback(null) ;})
        .on('error', function(err) { return callback(err); }) 
        .on('esl::end', function() { return callback('acl prevents connection');})
        .on('esl::event::auth::fail', function() {
          return callback('authentication failed') ;
        }) ;
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

        /* ignore timeout errors, because we'll be retrying anyways, and these will come in after we connect */
        if( err.code === 'ETIMEDOUT') {
          return ;
        }
        self.emit('error', err) ;

        self._conn.removeAllListeners() ;
        process.nextTick( function() {
          self.connection_gone(err); 
        }) ;
        return ;
      }
      self.install_listeners() ;
      self.online = true ;

      self._conn.subscribe(['HEARTBEAT']) ;
      self.emit('online') ;
    }
  ) ;
} ;
/**
 * This callback provides the response to a connection attempt to a freeswitch server
 * @callback Fsw~connectCallback
 * @param {string} err - error encountered attempting to connect and verify profile, or null if none
 */

/**
 * disconnect from the event socket
 */
Fsw.prototype.disconnect = function() {
  this.closing = true ;
  if( this._conn.connected() ) {
    this._conn.disconnect() ;
  }
} ;

// private
//retry 
Fsw.prototype.initialize_retry_vars = function () {
    this.retry_timer = null;
    this.retry_totaltime = 0;
    this.retry_delay = 150;
    this.retry_backoff = 1.7;
    this.attempts = 0;
};
Fsw.prototype.connection_gone = function (why) {
  var self = this;

  if( why === 'authentication failed') {
    console.log('not reattempting connection due to auth failure: update config file with correct secret and retry') ;
    return ;
  }
  if( why === 'acl prevents connection') {
    console.log('not reattempting connection due to ACL configuration on freeswitch: update freeswitch conf and retry') ;
    return ;
  }
  // If a retry is already in progress, just let that happen
  if (this.retry_timer) {
      return;
  }

  this.connected = false;
  this.ready = false;

  // If this is a requested shutdown, then don't retry
  if (this.closing) {
    this.retry_timer = null;
    return;
  }

  var nextDelay = Math.floor(this.retry_delay * this.retry_backoff);
  if (this.retry_max_delay !== null && nextDelay > this.retry_max_delay) {
      this.retry_delay = this.retry_max_delay;
  } else {
      this.retry_delay = nextDelay;
  }

  if (this.max_attempts && this.attempts >= this.max_attempts) {
      this.retry_timer = null;
      console.error("Fsw#connection_gone: Couldn't get drachtio connection after " + this.max_attempts + " attempts.");
      return;
  }

  this.attempts += 1;
  this.emit("reconnecting", {
      delay: self.retry_delay,
      attempt: self.attempts
  });
  this.retry_timer = setTimeout(function () {

      self.retry_totaltime += self.retry_delay;

      if (self.connect_timeout && self.retry_totaltime >= self.connect_timeout) {
          self.retry_timer = null;
          console.error("Fsw#connection_gone:: Couldn't get freeswitch connection after " + self.retry_totaltime + "ms.");
          return;
      }
      self.connect() ;

      self.retry_timer = null;
  }, this.retry_delay);
};
Fsw.prototype.install_listeners = function() {
  this._conn.removeAllListeners() ;
  this._conn.on('error', this._onError.bind(this) ) ;
  this._conn.on('esl::ready', this._onReady.bind(this) ) ;
  this._conn.on('esl::end', this._onEnd.bind(this) ) ;
  this._conn.on('esl::event::HEARTBEAT::*', this._onHeartbeat.bind(this)) ;
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
Fsw.prototype._onEnd = function() {
  this.online = false ;
  this.emit('offline') ;
  this.initialize_retry_vars() ;
  this.connection_gone('end') ;
} ;
Fsw.prototype._onError = function(err) {
  console.error('%s: _onError: ', err) ;
  this.emit('error', err);
  this.initialize_retry_vars() ;
  this.connection_gone(err) ;
};
Fsw.prototype._onReady = function() {
  console.log('%s: connected and ready', this.id) ;
} ;

Fsw.prototype.toJSON = function() {
  return {
    id: this.id,
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
