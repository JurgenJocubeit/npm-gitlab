var request = require('request');

var uri = process.env.GITLAB_URL || 'https://gitlab.com/api/v3';

module.exports.tags = function tags(user, repo, opt, cb) {
  getRepoId(user, repo, opt, function(err, id) {
      if (err) {
          console.log(err)
          return cb(new Error('unable to get tags for repo ' + user + '/' + repo));
      }

      getRepoTags(id, opt, cb);
  })
};

module.exports.getRepoId = getRepoId;
module.exports.getRepoTags = getRepoTags;

function getRepoId(user, repo, opt, cb) {
  var options = {
      url: uri + '/projects/' + encodeURIComponent(user + '/' + repo),
      json: true,
      headers: {
          'User-Agent': 'npm-gitlab-proxy'
      }
  };

  if (opt.token) {
      options.headers['PRIVATE-TOKEN'] = opt.token;
  }

  request(options, function(err, res, body) {
    if (err) {
        return cb(err);
    }

    if (res.statusCode !== 200) {
        return cb(new Error('Invalid status code'));
    }

    cb(null, body.id);
  });
}

function getRepoTags(id, opt, cb) {
  var options = {
      url: uri + '/projects/' + id + '/repository/tags',
      json: true,
      headers: {
          'User-Agent': 'npm-gitlab-proxy'
      }
  };

  if (opt.token) {
      options.headers['PRIVATE-TOKEN'] = opt.token;
  }

  request(options, function(err, res, body) {
     if (err) {
        return cb(err);
     }

     if (res.statusCode !== 200) {
        return cb(new Error('Invalid status code'));
     }

     var out = body.map(function(tag) {
       var u = uri + '/projects/' + id + '/repository/archive?sha=';
       u += tag.commit.id;
       return {
         name: tag.name,
         tarball_url: u
       };
     });

     cb(null, out);
  });
}
