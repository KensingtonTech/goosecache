'use strict';

const generateKey = require('./generate-key');
const recoverObjectId = require('./recover-objectid');
const noop = () => {};

let hasBeenExtended = false;
let log;

module.exports = function(mongoose, gooseCache, logger) {
  const aggregate = mongoose.Model.aggregate;
  log = logger;

  mongoose.Model.aggregate = function() {
    const res = aggregate.apply(this, arguments);

    if (!hasBeenExtended && res.constructor && res.constructor.name === 'Aggregate') {
      extend(res.constructor);
      hasBeenExtended = true;
    }
    return res;
  };

  function extend(Aggregate) {
    const mongooseExec = Aggregate.prototype.exec;

    Aggregate.prototype.exec = function(callback = noop) {
      if (!this.hasOwnProperty('_ttl')) {
        return mongooseExec.apply(this, arguments);
      }

      const key = this._key || this.getCacheKey();
      const ttl = this._ttl;

      return new Promise(async (resolve, reject) => {
        log.debug('getting results from cache with cache.get()');
        try {
          let cachedResults = await gooseCache.get(key);
          if (cachedResults) {
            log.debug('got a cached result!');
            log.debug('running callback()');
            cachedResults = recoverObjectId(mongoose, cachedResults);
            callback(null, cachedResults);
            log.debug('returning with resolve()');
            return resolve(cachedResults);
          }
        }
        catch (err) {
          reject(err);
        }
        log.debug('Cached result not found -- querying mongo');

        try {
          const results = await mongooseExec.call(this);
          log.debug('setting result in cache');
          await gooseCache.set(key, results, ttl);
          callback(null, results);
          resolve(results);
        }
        catch (err) {
          callback(err);
          reject(err);
        }
      });
    };



    Aggregate.prototype.cache = function(ttl = 60, customKey = '') {
      if (typeof ttl === 'string') {
        customKey = ttl;
        ttl = 60;
      }
      this._ttl = ttl;
      this._key = customKey;
      return this;
    };



    Aggregate.prototype.getCacheKey = function() {
      return generateKey(this._pipeline, logger);
    };
  }
};
