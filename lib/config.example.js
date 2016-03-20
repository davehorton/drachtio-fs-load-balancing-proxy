'use strict';


// copy to config.js and add your info
// =================================
module.exports = {

  //drachtio server to connect to
  drachtioServer: {
    address: '127.0.0.1',
    port: 9022,
    secret: 'cymru'
  }, 

  //array of one or more freeswitch servers
  targets: [
    {
      address: 'ip-address-server1',    //IP address freeswitch event socket is listening on
      port: 8021,                       //port freeswitch event socket is listening on
      secret: 'ClueCon',                     //freeswitch secret
      profile: 'external',              //sofia sip profile to send SIP requests to
      enabled: true                     //if false, skip this destination (note: you can edit while running and it will take affect)
    },
    {
      address: 'ip-address-server2',    //IP address freeswitch event socket is listening on
      port: 8021,                       //port freeswitch event socket is listening on
      secret: 'ClueCon',                     //freeswitch secret
      profile: 'external',              //sofia sip profile to send SIP requests to
      enabled: true                     //if false, skip this destination (note: you can edit while running and it will take affect)
    }
  ], 

  localAddress: '127.0.0.1',            //optional: local address to bind client event socket to

  maxTargets: 2,                        //optional: max number of servers to attempt to send a single request to 

  authorizedSources: ['68.64.80.0/24']   // optional: array of CIDRs for servers that are allowed to send to us

} ;