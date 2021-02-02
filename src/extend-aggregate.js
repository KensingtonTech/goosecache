'use strict';

const generateKey = require('./generate-key');
const noop = () => {};

let hasBeenExtended = false;
let log;

module.exports = function(mongoose, cache, logger) {
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

      return new Promise((resolve, reject) => {

        log.debug('getting results from cache with cache.get()');
        cache.get(key, (err, cachedResults) => { //eslint-disable-line handle-callback-err
          if (cachedResults != null) {
            log.debug('got a cached result!');

            // cachedResults = recoverObjectId(mongoose, cachedResults);
            log.debug('running callback()');
            callback(null, cachedResults);
            log.debug('returning with resolve()');
            return resolve(cachedResults);
          }

          log.debug('didn\'t find a cached result :( -- fetching from mongo');

          mongooseExec
            .call(this)
            .then( (results) => {
              log.debug('setting result in cache with cache.set()');
              cache.set(key, results, ttl, () => {
                callback(null, results);
                resolve(results);
              });
            })
            .catch( (err) => {
              callback(err);
              reject(err);
            });
        });
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
      return generateKey(this._pipeline);
    };
  }

};
