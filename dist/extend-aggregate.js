'use strict';

const generateKey = require('./generate-key');

const noop = () => {};

let hasBeenExtended = false;

module.exports = function (mongoose, cache) {
  const aggregate = mongoose.Model.aggregate;

  mongoose.Model.aggregate = function () {
    const res = aggregate.apply(this, arguments);

    if (!hasBeenExtended && res.constructor && res.constructor.name === 'Aggregate') {
      extend(res.constructor);
      hasBeenExtended = true;
    }

    return res;
  };

  function extend(Aggregate) {
    const mongooseExec = Aggregate.prototype.exec;

    Aggregate.prototype.exec = function (callback = noop) {
      if (!this.hasOwnProperty('_ttl')) {
        return mongooseExec.apply(this, arguments);
      }

      const key = this._key || this.getCacheKey();
      const ttl = this._ttl;
      return new Promise((resolve, reject) => {
        console.log('getting results from cache with cache.get()');
        cache.get(key, (err, cachedResults) => {
          //eslint-disable-line handle-callback-err
          if (cachedResults != null) {
            console.log('got a cached result!'); // cachedResults = recoverObjectId(mongoose, cachedResults);

            console.log('running callback()');
            callback(null, cachedResults);
            console.log('returning with resolve()');
            return resolve(cachedResults);
          }

          console.log('didn\'t find a cached result :( -- fetching from mongo');
          mongooseExec.call(this).then(results => {
            console.log('setting result in cache with cache.set()');
            cache.set(key, results, ttl, () => {
              callback(null, results);
              resolve(results);
            });
          }).catch(err => {
            callback(err);
            reject(err);
          });
        });
      });
    };

    Aggregate.prototype.cache = function (ttl = 60, customKey = '') {
      if (typeof ttl === 'string') {
        customKey = ttl;
        ttl = 60;
      }

      this._ttl = ttl;
      this._key = customKey;
      return this;
    };

    Aggregate.prototype.getCacheKey = function () {
      return generateKey(this._pipeline);
    };
  }
};