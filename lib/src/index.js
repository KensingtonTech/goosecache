'use strict';

const ReCacheman = require('@kensingtontech/recacheman');
const log = require('loglevel');
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

  setLogLevel(logLevel) {
    log.setLevel(logLevel);
  }


  async clear() {
    log.debug('goosecache.clear()');
    return new Promise( async (resolve, reject) => {
      this.recacheman.clear((err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }


  async get(key) {
    log.debug('goosecache.get(): key:', key);
    return new Promise( (resolve, reject) => {
      this.recacheman.get(key, (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      });
    });
  }


  async set(key, value, ttl) {
    log.debug('goosecache.set(), key:', key);
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


  async evalSha(...args) {
    log.debug('goosecache.evalSha(): args:', args);
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


  async del(key) {
    // is actually unlink() within recacheman-redis
    log.debug('goosecache.del(): key', key);
    return new Promise(
      (resolve, reject) => {
        return this.recacheman.del(key, (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      }
    );
  };


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
