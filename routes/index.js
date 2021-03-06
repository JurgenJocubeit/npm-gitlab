var express = require('express')
var NotFound = require('httperrors').NotFound
var debug = require('debug')('registry:router')
var request = require('request')
var async = require('async')

var shasum_url = require('../lib/shasum_url')
var gitlab = require('../lib/gitlab')

var gitlab_uri = process.env.GITLAB_URL || 'https://gitlab.com/api/v3'

var router = express.Router()

// parse the module name into a the separate user/repo parts
// put that into req.module_spec for future routes
router.param('module', function (req, res, next, name) {
  debug('module name', name)

  // we only support '@' scoped modules currently
  if (name[0] !== '@') {
    return next(NotFound)
  }

  var parts = name.replace('@', '').split('/')

  var spec = req.module_spec = {
    name: name,
    user: parts[0],
    repo: parts[1]
  }

  debug(spec)
  next()
})

// get details for module from github
// assemble the details by querying for the tags
// then shasum of each tag tarball to create the distribution list
// we have to do this for all tags because npm is stupid and doesn't tell us what
// version the person wants to install
// ... have not yet found a hack to make existing npm do that... complain to npm authors more
router.get('/:module', function(req, res, next) {
  var spec = req.module_spec

  var user = spec.user
  var repo = spec.repo

  var opt = {
    token: req.oauth_token
  }

  debug('details for %s/%s: %j', user, repo, opt)


  function shasum_tag_map(tag, cb) {
    var name = tag.name
    var version = name.replace(/^v/, '')

    shasum_url(tag.tarball_url, opt, function(err, shasum) {
      if (err) {
        return cb(err)
      }

      gitlab.file(user, repo, tag.name, opt, req.curry(function(package) {
        cb(null, {
          name: name
        , _id: name + '@' + version
        , version: version
        , shasum: shasum
        , tarball: tag.tarball_url
        , package: package
        })
      }))
    })
  }

  gitlab.tags(user, repo, opt, req.curry(function(tags) {
    if (tags.length === 0) {
      return next(NotFound())
    }

    async.mapSeries(tags, shasum_tag_map, req.curry(function(sha_tags) {
      var latest_version = sha_tags[0].version

      var map = Object.create(null)
      sha_tags.forEach(function(tag) {
        map[tag.version] = {
          name: spec.name
        , _id: tag._id
        , version: tag.version
        , dependencies: tag.package.dependencies
        , devDependencies: tag.package.devDependencies
        , dist: {
            shasum: tag.shasum
          , tarball: req.href + '/' + encodeURIComponent(spec.name) + '/' + tag.name + '/tarball'
          }
        }
      })

      res.json({
        name: spec.name
      , _id: spec.name
      , description: spec.name
      , versions: map
        // need to have latest match the single version 'tag'
        // so that '*' in package.json works
      , 'dist-tags': {
          latest: latest_version
        }
      })
    }))
  }))
})

router.get('/:module/:version', function(req, res, next) {
  var version = req.param('version')
  var spec = req.module_spec

  var user = spec.user
  var repo = spec.repo
  debug('details for %s/%s', user, repo)

  var opt = {
    token: req.oauth_token
  }

  function shasum_tag_map(tag, cb) {
    var name = tag.name
    var version = name.replace(/^v/, '')

    shasum_url(tag.tarball_url, opt, function(err, shasum) {
      if (err) return cb(err)

      gitlab.file(user, repo, tag.name, opt, req.curry(function(package) {
        cb(null, {
          name: name
        , _id: name
        , version: version
        , shasum: shasum
        , tarball: tag.tarball_url
        , package: package
        })
      }))
    })
  }

  gitlab.tags(user, repo, opt, req.curry(function(tags) {
    if (tags.length === 0) return next(NotFound())

    tags = tags.filter(function(tag) {
      return tag.name === 'v' + version
    })

    if (tags.length !== 1) {
      return res.sendStatus(404)
    }

    var tag = tags.shift()

    shasum_tag_map(tag, req.curry(function(tag) {
      res.json({
        name: spec.name
      , _id: spec.name
      , version: tag.version
      , dependencies: tag.package.dependencies
      , devDependencies: tag.package.devDependencies
      , scripts: tag.package.scripts
      , dist: {
          shasum: tag.shasum
        , tarball: req.href + '/' + encodeURIComponent(spec.name) + '/' + tag.name + '/tarball'
        }
      })
    }))
  }))
})

// serve up the tarball
// use this proxy versus direct github for authroization
router.get('/:module/:version/tarball', function(req, res, next) {
  var spec = req.module_spec
  var user = spec.user
  var repo = spec.repo
  var tag = req.param('version')

  // https://api.github.com/repos/<user>/<repo>/tarball/<tag | commitsh>'

  // TODO: Change this to gitlab url
  // http://gitlab.eirenerx.com/<user>/<repo>/repository/archive.tar.gz?ref=<tag>

  var tarball_url = gitlab_uri + '/repos/' + user + '/' + repo + '/tarball/' + tag

  gitlab.tags(user, repo, {
    token: req.oauth_token
  }, function(err, tags) {
    if (err) {
      return next(new Error('Invalid package'))
    }

    if (!tags.length) {
      return next(new Error('Invalid tag'))
    }

    var len = tags.length
    var tarball_url
    for (var i = 0; i < len; i++) {
      var tag_ = tags[i]
      debug('match tag %s to %j', tag, tag_)
      if (tag_.name === tag) {
        tarball_url = tag_.tarball_url
        break
      }
    }

    debug('proxy tarball', tarball_url)

    var options = {
      uri: tarball_url,
      headers: {
        'User-Agent': 'npm-github-proxy',
      }
    }

    if (req.oauth_token) {
      options.headers['PRIVATE-TOKEN'] = req.oauth_token
    }

    request(options).pipe(res)
  })
})

module.exports = router
