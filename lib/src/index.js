'use strict';

const ReCacheman = require('@kensingtontech/recacheman');
const log = require('loglevel');
const noop = () => {};
let hasRun = false;

class GooseCache {

  constructor(mongoose, recachemanOptions = {}, logLevel = 'warn') {
    if (typeof mongoose.Model.hydrate !== 'function') {
      throw new Error('Goosecache is only compatible with versions of mongoose that implement the `model.hydrate` method');
    }
    log.setLevel(logLevel);
    this.options = recachemanOptions;
    this.recacheman = new ReCacheman(null, recachemanOptions);
    if (hasRun) {
      return;
    }

    hasRun = true;
    require('./extend-query')(mongoose, this, log);
    require('./extend-aggregate')(mongoose, this, log);
  }



  clearCache(key, cb = noop) {
    log.debug('goosecache.clearCache(): key:', key);
    if (!key) {
      log.info('goosecache.clearCache(): clearing entire cache');
      this.clear(cb);
      return;
    }
    this.del(key, cb);
  }



  async clearCachePromise(key) {
    log.debug('goosecache.clearCachePromise(): key:', key);
    return new Promise( (resolve) => {
      if (!key) {
        log.info('goosecache.clearCachePromise(): clearing entire cache');
        this.clear( () => resolve() );
      }
      else {
        this.del(key, () => resolve() );
      }
    });
  }



  get(key, cb = noop) {
    log.debug('goosecache.get(): key:', key);
    return this.recacheman.get(key, cb);
  }



  async getPromise(key) {
    log.debug('goosecache.getPromise(): key:', key);
    return new Promise( (resolve, reject) => {
      this.recacheman.get(key, (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      });
    });
  }



  set(key, value, ttl, cb = noop) {
    log.debug('goosecache.set(): key:', key);
    if (ttl === 0) {
      ttl = -1;
    }
    return this.recacheman.set(key, value, ttl, cb);
  };



  async setPromise(key, value, ttl) {
    log.debug('goosecache.setPromise(), key:', key);
    if (ttl === 0) {
      ttl = -1;
    }
    return new Promise( (resolve, reject) => {
      this.recacheman.set(key, value, ttl, (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      });
    });
  };



  evalSha(...args) {
    // cb must be provided as final argument
    log.debug('goosecache.evalSha(): args:', args);
    if (this.recacheman.options.engine !== 'redis') {
      throw new Error('Engine is not redis');
    }
    return this.redis.evalsha(...args);
  }



  async evalShaPromise(...args) {
    log.debug('goosecache.evalShaPromise(): args:', args);
    if (this.recacheman.options.engine !== 'redis') {
      throw new Error('Engine is not redis');
    }
    return new Promise( (resolve, reject) => {
      this.redis.evalsha(...[...args, (err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(res);
      }]);
    });
  }



  del(key, cb = noop) {
    // is actually unlink() within recacheman-redis
    log.debug('goosecache.unlink(): key', key);
    return this.recacheman.del(key, cb);
  };



  clear(cb = noop) {
    log.debug('goosecache.clear()');
    return this.recacheman.clear(cb);
  }



  get redis() {
    log.debug('goosecache.redis()');
    if (this.options.engine !== 'redis') {
      throw new Error('Engine is not redis');
    }
    return this.recacheman._engine.client;
  }
}

module.exports = {
  GooseCache,
  default: GooseCache
};
