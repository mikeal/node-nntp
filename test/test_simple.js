var nntp = require('../lib/nntp')
  , path = require('path')
  , fs = require('fs')
  , sys = require('sys')
  , assert = require('assert');
    
var creds = fs.readFileSync(path.join(__dirname, 'creds')).replace('\n','').split(',')

var c = nntp.createClient(undefined, 'news.giganews.com');
c.auth(creds[0], creds[1], function(error) {if (error) throw error; sys.puts('auth set')});
c.group('alt.binaries.comics.dcp', function (error, status, size, first, second) {
  sys.puts('group set')
  if (error) throw error;
  c.head(first, function (error, headers){
    sys.puts('head reply')
    if (error) throw error;
    c.body(first, function (error, body) {
      sys.puts('body reply '+first)
      if (error) throw error;
      sys.puts(JSON.stringify(body.slice(0,500)))
      sys.puts(body.slice(0,500))
    })
  })
});