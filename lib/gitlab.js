var request = require('request')
  , debug = require('debug')('registry:gitlab')

var uri = process.env.GITLAB_URL || 'https://gitlab.com/api/v3'

exports.tags = function tags(user, repo, opt, cb) {
  exports.getRepoId(user, repo, opt, function(err, id) {
    if (err) {
      console.log(err)
      return cb(new Error('unable to get tags for repo ' + user + '/' + repo))
    }

    exports.getRepoTags(id, opt, cb)
  })
}

exports.getPackageSha = function getPackageSha(repoId, tag, opt, cb) {
  var opts = {
    url: `${uri}/projects/${repoId}/repository/tree`
  , json: true
  , headers: {
    'User-Agent': 'npm-gitlab-proxy'
    }
  , qs: {
      ref_name: tag
    }
  }

  if (opt.token) {
    opts.headers['PRIVATE-TOKEN'] = opt.token
  }

  debug('GET: %s', opts.url)

  request.get(opts, function(err, res, body) {
    if (err) return cb(err)

    if (res.statusCode !== 200) {
      return cb(new Error('Invalid status code'))
    }

    if (!body.length) {
      return cb(new Error('Invalid response. No body'))
    }

    var sha
    var len = body.length
    for (var i = 0; i < len; i++) {
      var obj = body[i]
      if (obj.name === 'package.json') {
        sha = obj.id
        break
      }
    }

    if (!sha) {
      return cb(new Error('Unable to find package.json'))
    }

    cb(null, sha)
  })
}

function getShaAndRepoId(user, repo, tag, opt, cb) {
  exports.getRepoId(user, repo, opt, function(err, repoId) {
    if (err) return cb(err)
    exports.getPackageSha(repoId, tag, opt, function(err, sha) {
      if (err) return cb(err)
      cb(null, repoId, sha)
    })
  })
}

exports.file = function file(user, repo, tag, opt, cb) {
  getShaAndRepoId(user, repo, tag, opt, function(err, repoId, sha) {
    if (err) return cb(err)
    var opts = {
      url: `${uri}/projects/${repoId}/repository/raw_blobs/${sha}`
    , json: true
    , headers: {
        'User-Agent': 'npm-gitlab-proxy'
      }
    }

    if (opt.token) {
      opts.headers['PRIVATE-TOKEN'] = opt.token
    }

    debug('GET: %s', opts.url)

    request.get(opts, function(err, res, body) {
      if (err) return cb(err)
      if (res.statusCode !== 200) {
        return cb(new Error(`unable to get file for repo ${user}/${repo}`))
      }
      cb(null, body)
    })
  })
}

exports.getRepoId = function getRepoId(user, repo, opt, cb) {
  var options = {
    url: uri + '/projects/' + encodeURIComponent(user + '/' + repo)
  , json: true
  , headers: {
      'User-Agent': 'npm-gitlab-proxy'
    }
  }

  if (opt.token) {
    options.headers['PRIVATE-TOKEN'] = opt.token
  }

  debug('GET: %s', options.url)

  request(options, function(err, res, body) {
    if (err) return cb(err)

    if (res.statusCode !== 200) {
      return cb(new Error('Invalid status code'))
    }

    cb(null, body.id)
  })
}

exports.getRepoTags = function getRepoTags(id, opt, cb) {
  var options = {
    url: uri + '/projects/' + id + '/repository/tags'
  , json: true
  , headers: {
      'User-Agent': 'npm-gitlab-proxy'
    }
  }

  if (opt.token) {
    options.headers['PRIVATE-TOKEN'] = opt.token
  }

  debug('GET: %s', options.url)

  request(options, function(err, res, body) {
    if (err) return cb(err)

    if (res.statusCode !== 200) {
      return cb(new Error('Invalid status code'))
    }

    var out = body.map(function(tag) {
      var u = uri + '/projects/' + id + '/repository/archive?sha='
      u += tag.commit.id
      return {
        name: tag.name
      , tarball_url: u
      }
    })

    cb(null, out)
  })
}
