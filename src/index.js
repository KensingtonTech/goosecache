'use strict';

const Cacheman = require('@kensingtontech/recacheman');
const log = require('loglevel');

const noop = () => {};

class GooseCache {

  constructor(mongoose, options = {}, logLevel = 'warn') {
    if (typeof mongoose.Model.hydrate !== 'function') {
      throw new Error('Cachegoose is only compatible with versions of mongoose that implement the `model.hydrate` method');
    }

    if (this.hasRun) {
      return;
    }

    log.setLevel(logLevel);

    this.options = options;

    this.hasRun = true;

    this.cache = new Cacheman(null, options);

    require('./extend-query')(mongoose, this, log);

    require('./extend-aggregate')(mongoose, this, log);

  }



  clearCache(key, cb = noop) {
    log.debug('recachegoose.clearCache(): key:', key);
    if (!key) {
      log.info('recachegoose.clearCache(): clearing entire cache');
      this.clear(cb);
      return;
    }

    this.del(key, cb);
  }



  async clearCachePromise(key) {
    log.debug('recachegoose.clearCachePromise(): key:', key);
    return new Promise( (resolve, reject) => {
      if (!key) {
        log.info('recachegoose.clearCache(): clearing entire cache');
        this.clear( () => {
          return resolve();
        });
      }
      else {
        this.del(key, () => {
          return resolve();
        });
      }

    });
  }



  get(key, cb = noop) {
    log.debug('recachegoose.get(): key:', key);
    return this.cache.get(key, cb);
  }



  async getPromise(key) {
    log.debug('recachegoose.getPromise(): key:', key);
    return new Promise( (resolve, reject) => {
      this.cache.get(key, (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      });
    });
  }



  set(key, value, ttl, cb = noop) {
    log.debug('recachegoose.set(): key:', key);
    if (ttl === 0) ttl = -1;
    return this.cache.set(key, value, ttl, cb);
  };



  async setPromise(key, value, ttl) {
    log.debug('recachegoose.setPromise(), key:', key);
    if (ttl === 0) ttl = -1;
    return new Promise( (resolve, reject) => {
      this.cache.set(key, value, ttl, (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      });
    });
  };



  evalSha(...args) {
    log.debug('recachegoose.evalSha(): args:', args);
    // cb must be provided as final argument
    if (this.cache.options.engine === 'redis') {
      const redis = this.cache._engine.client;
      return redis.evalsha(...args);
    }
    throw new Error('Engine is not redis');
  }



  async evalShaPromise(...args) {
    log.debug('recachegoose.evalShaPromise(): args:', args);
    if (this.cache.options.engine === 'redis') {
      const redis = this.cache._engine.client;
      return new Promise( (resolve, reject) => {
        redis.evalsha([...args, (err, res) => {
          if (err) {
            return reject(err);
          }
          return resolve(res);
        }]);
      });
    }
    throw new Error('Engine is not redis');
  }



  del(key, cb = noop) {
    log.debug('recachegoose.del(): key', key);
    return this.cache.del(key, cb);
  };



  clear(cb = noop) {
    log.debug('recachegoose.clear()');
    return this.cache.clear(cb);
  }



  get redis() {
    log.debug('recachegoose.redis()');
    if (this.options.engine === 'redis') {
      return this.cache._engine.client;
    }
    throw new Error('Engine is not redis');
  }

}

module.exports = {
  GooseCache,
  default: GooseCache
};
