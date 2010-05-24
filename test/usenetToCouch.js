var nntp = require('../lib/nntp')
  , path = require('path')
  , fs = require('fs')
  , sys = require('sys')
  , base64 = require('./base64')
  , request = require('request')
  , assert = require('assert');
    
var creds = fs.readFileSync(path.join(__dirname, 'creds')).replace('\n','').split(',');

var couchurl = 'http://mikeal.couchone.com/nntptest';

var c = nntp.createClient(undefined, 'news.giganews.com');
c.auth(creds[0], creds[1], function(error) {if (error) throw error; sys.puts('auth set')});
c.group('alt.binaries.comics.dcp', function (error, status, size, first, second) {
  var dostuff = function () {
    c.head(first, function (error, headers){
      if (error) throw error;
      var yListener = function (info, body) {
        sys.puts('ypart')
        headers._id = first.toString();
        headers.ypartInfo = info;
        headers._attachments = {'ypart':{content_type:'multipart/x-mixed-replace', 
                                         data:base64.encode(body)}};
        request({uri:couchurl, method:'POST', body:JSON.stringify(headers), headers:{'content-type':'application/json'}}, function (error, response, body) {
          sys.puts(body)
          first += 1;
          c.removeListener("ypart", yListener);
          dostuff();
        })
      }
      c.addListener('ypart', yListener)
      c.body(first, function (error, body) {
        // sys.puts('body reply '+first)
        // if (error) throw error;
        // sys.puts(JSON.stringify(body.slice(0,500)))
        // sys.puts(body.slice(0,500))
      })
    })
  }
  dostuff();
});