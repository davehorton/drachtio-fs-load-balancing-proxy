[![drachtio logo](http://davehorton.github.io/drachtio-fs-load-balancing-proxy/img/definition-only-cropped.png)](http://davehorton.github.io/drachtio-fs-load-balancing-proxy)

 drachtio-fs-load-balancing-proxy is a [nodejs](https://nodejs.org)-based [SIP](http://www.ietf.org/rfc/rfc3261.txt) load balancer for [Freeswitch](https://freeswitch.org/) servers.

It is based on the high-performance [drachtio signaling resource framework](http://davehorton.github.io/drachtio-srf/), which in turn utilizes the [sofia](https://github.com/davehorton/sofia-sip") SIP stack.

The need to load balance SIP traffic across a horizontal cluster of Freeswitch servers is a common requirement.  While other solutions exist (e.g. [Kamailio](http://www.kamailio.org/), the solution presented here may be more desirable to nodejs developers who prefer Javascript over proprietary and cryptic configuration-driven logic.  Additionally, the [underlying framework](http://davehorton.github.io/drachtio-srf/) provides tools to build a wider range of VoIP applications beyond simple SIP proxies.

drachtio is an open-source, nodejs-based ecosystem for creating any kind of VoIP server-based application: registrar, proxy, back-to-back user agent, and many others. Furthermore, when coupled with the drachtio [media resource function](http://davehorton.github.io/drachtio-fsmrf/), rich media-processing applications can be easily built as well.  Nodejs developers experienced with the [express](http://expressjs.com/) or [connect](https://github.com/senchalabs/connect) middleware frameworks will find drachtio very familiar.

### Getting Started

*Note:* API documentation on the key application classes [can be found here](http://davehorton.github.io/drachtio-fs-load-balancing-proxy/api/index.html)

The basics:

```bash
  $ git clone git@github.com:davehorton/drachtio-fs-load-balancing-proxy.git
  $ cd fs-load-balancing-proxy
  $ npm install
```

Next, copy <code>lib/config.example.js</code> to <code>config.js</code>, and edit to specify the coordinates of your freeswitch servers, as well as your drachtio server process.

Then fire it up!

```bash
  $ node app.js
```

### Hacking the code
Contributors are welcome!  Feel free to fork the repo and send me pull requests for any features or bug fixes.

The code is pretty simple, and there isn't that much of it.  Here are a few notes to get you started:

* [app.js](https://github.com/davehorton/drachtio-fs-load-balancing-proxy/blob/master/app.js) - the main entry point to the application is dead simple.  It creates the necessary instances of the drachtio app and srf (signaling resource framework), connects to the drachtio server and the loads in the routes, which are found in <code>lib/proxy.js</code>.

* [lib/proxy.js](https://github.com/davehorton/drachtio-fs-load-balancing-proxy/blob/master/lib/proxy.js) - this has the invite handler and executes the key line of code that actually makes everything happen: <code>req.proxy(..)</code>.  It relies on <code>lib/cluster.js</code> to provide the list of online freeswitch servers to proxy to, so this file is actually pretty simple as well.

* [lib/cluster.js](https://github.com/davehorton/drachtio-fs-load-balancing-proxy/blob/master/lib/cluster.js) - this module manages the freeswitch servers; its main responsibility is simply to keep track of which freeswitch servers are online at any point in time.  It also watches for changes to the <code>lib/config.js</code> file and automatically updates the list of freeswitch servers as any entries are added or removed from the config file -- there is no need to restart anything for changes to take affect.

* [lib/fsw.js](https://github.com/davehorton/drachtio-fs-load-balancing-proxy/blob/master/lib/fsw.js) - this modules manages the connection to an indvidual freeswitch server.  It connects and receives heartbeat messages from the freeswitch server each 20 seconds.  Any time the connection is lost it will automatically begin retrying to connect.

* [lib/connect.js](https://github.com/davehorton/drachtio-fs-load-balancing-proxy/blob/master/lib/config.example.js) - this is the configuration file.  You'll need to copy config.example.js to config.js to start with, then edit to your desires.  The file itself is documented so it won't be further described here.


### License
[MIT](https://github.com/davehorton/drachtio-fs-load-balancing-proxy/blob/master/LICENSE)
