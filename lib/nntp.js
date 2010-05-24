var net = require('net')
  ,  sys = require('sys')
  ,  events = require('events');
        
var end = '\r\n'        
var endEntity = end + '.' + end
        
function Client (port, host) {
  var self = this;
  if (!port) {port = 119}
  self.busy = true;
  self.queue = [];
  self.buffer = '';
  self.connection = net.createConnection(port, host);
  self.connection.addListener("connect", function () {
    self.start();
  })
  self.connection.addListener("error", function (error) {
    self.emit("error", error);
  })
}    
sys.inherits(Client, events.EventEmitter);
Client.prototype.start = function () {
  var self = this;
  var inEntity = false;
  var parse = function () {
    if (!inEntity && self.buffer.indexOf(end) !== -1) {
      if (self.buffer[3] === ' ' && !isNaN(parseInt(self.buffer.slice(0, 3)))) {
        var status = parseInt(self.buffer.slice(0, 3));
        var line = self.buffer.slice(4, self.buffer.indexOf(end));
        self.buffer = self.buffer.slice(self.buffer.indexOf(end) + end.length);
        self.emit("response", status, line);
        parse();
      } else {
        inEntity = true;
        parse();
      }
    } else if (inEntity && self.buffer.indexOf(endEntity) !== -1) {
      var i = self.buffer.indexOf(endEntity);
      var body = self.buffer.slice(0, i + 2);
      self.buffer = self.buffer.slice(i + endEntity.length);
      self.emit('entity-body', body);
      inEntity = false;
      parse();
    }
  }
  var dataListener = function (chunk) {
    self.buffer += chunk.toString();
    // sys.puts('buffer: '+chunk.toString())
    parse();
  }
  self.dataListener = dataListener;
  self.connection.addListener("data", dataListener)
  var openListener = function (status, line) {
    self.removeListener("response", openListener);
    if (status == 200) {
      self.busy = false;
      self._kick();
    } else {
      self.emit("error", new Error("Initial status was not 200."))
    } 
  }
  self.ypartListener = function (body) {
    if (body.slice(0,2) == end) {
      body = body.slice(2);
    }
    if (body.slice(0, '=ybegin'.length) == '=ybegin') {
      var parsePartLine = function (line, info) {
        // Man, ypart parsing if fucking RETARDED!
        var key;
        var value;
        var e;
        while (line.indexOf('=') !== -1) {
          key = line.slice(0, line.indexOf('='));
          line = line.slice(line.indexOf('=')+1);
          if ( line.indexOf('=') !== -1) {
            e = line.slice(0,line.indexOf('=')).indexOf(' ');
          } else {
            if (line.indexOf(end) !== -1) {
              e = line.indexOf(end);
            } else {
              e = line.length;
            }
            
          }
          value = line.slice(0, e);
          line = line.slice(e + 1);
          info[key] = value;
        } 
      }
      var info = {ybegin:{},ypart:{},yend:{}};
      var line = body.slice('=ybegin '.length, body.indexOf(end));
      parsePartLine(line, info.ybegin);
      body = body.slice(body.indexOf(end) + end.length);
      line = body.slice('=ypart '.length, body.indexOf(end));
      parsePartLine(line, info.ypart);
      body = body.slice(body.indexOf(end) + end.length);
      line = body.slice(body.lastIndexOf(end+'=yend ') + (end+'=yend ').length);
      body = body.slice(0 ,body.lastIndexOf(end+'=yend '))
      parsePartLine(line, info.yend);
      self.emit('ypart', info, body);
    }
  }
  self.addListener("entity-body", self.ypartListener)
  self.addListener("response", openListener)
}
Client.prototype.send = function (line) {
  // sys.puts('send '+line)
  this.connection.write(line + end);
}
Client.prototype._kick = function () {
  if (!this.busy && this.queue.length > 0) {
    this.busy = true;
    this.queue.shift()();
  }
}
Client.prototype.request = function (request) {
  var self = this;
  var e = {end: function () {
    self.listeners("response").forEach(function (l) {self.removeListener("response", l)});
    self.listeners("entity-body").forEach(function (l) {
      if (l !== self.ypartListener) {
        self.removeListener("entity-body", l);
      }
    });
    self.busy = false; 
    self._kick();
  }}
  self.queue.push(request);
  self._kick();
  return e;
}
Client.prototype.auth = function (username, password, callback) {
  var self = this;
  var userline = false;
  var e;
  var req = function () {
    self.addListener("response", function (status, line) {
      if (!userline) {
        userline = line;
        self.send('AUTHINFO PASS '+password);
      } else {
        if (callback) callback(null, line, line);
        e.end();
      }
    })
    self.send('AUTHINFO USER '+username)
  }
  e = self.request(req);
  return e;
}
Client.prototype.group = function (group, callback) {
  var self = this;
  var e;
  var req = function () {
    self.addListener("response", function (status, line) {
      var args = [null, status];
      line = line.split(' ').forEach(function (e) {
        args.push(isNaN(parseInt(e)) ? e : parseInt(e))
      });
      if (callback) callback.apply(callback, args);
      e.end()
    })
    self.send('GROUP '+group)
  }
  e = self.request(req);
  return e;
}
Client.prototype.head = function (id, callback) {
  var self = this;
  var e;
  var req = function () {
    self.addListener("response", function (status) {
      if (status < 199 || status > 300) {
        callback(new Error("Status is not 2xx. Status is "+status));
        e.end();
      }
    })
    self.addListener("entity-body", function (body) {
      var lines = body.split(end);
      var headers = {};
      lines.forEach(function (l) {
        var i = l.indexOf(': ');
        if (l.slice(0, i).length > 0) {
          headers[l.slice(0, i)] = l.slice(i + 2);
        }
      })
      callback(null, headers);
      e.end();
    })
    self.send('HEAD '+id)
  }
  e = self.request(req);
  return e;
}
Client.prototype.body = function (id, callback) {
  var self = this;
  var e;
  var req = function () {
    self.addListener("response", function (status) {
      if (status < 199 || status > 300) {
        callback(new Error("Status is not 2xx. Status is "+status));
        e.end();
      }
    })
    self.addListener("entity-body", function (body) {
      callback(null, body);
      e.end();
    })
    self.send('BODY '+id)
  }
  e = self.request(req);
  return e;
}

exports.createClient = function (port, host) {return new Client(port, host)}