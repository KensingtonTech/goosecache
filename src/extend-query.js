'use strict';

const generateKey = require('./generate-key');
const noop = () => {};

let log;


module.exports = function(mongoose, gooseCache, logger) {
  const mongooseExec = mongoose.Query.prototype.exec;
  log = logger;

  mongoose.Query.prototype.exec = function(op, callback = noop ) {
    // log.debug('typeof op:', typeof op);
    // log.debug('typeof callback:', typeof callback);

    if (!this.hasOwnProperty('_ttl')) { // _ttl is set by .cache()
      // log.debug('didn\'t find _ttl -- running mongoose exec');
      return mongooseExec.apply(this, arguments);
    }

    log.debug('mongoose.Query.prototype.exec()');

    if (typeof op === 'function') {
      callback = op;
      op = null;
    }
    else if (typeof op === 'string') {
      this.op = op;
    }

    let key = this._key || this.getCacheKey();
    const derivedKey = this._derivedKey;

    const ttl = this._ttl;
    const isCount = ['count', 'countDocuments', 'estimatedDocumentCount'].includes(this.op);
    const isLean = this._mongooseOptions.lean;
    const modelName = this.model.modelName;

    const cacheGetScript = this._cacheGetScript;
    const cacheGetScriptArgs = this._cacheGetScriptArgs || [];

    const postCacheScript = this._postCacheScript;
    const postCacheScriptArgs = this._postCacheScriptArgs || [];
    const postCacheScriptDerivedKey = this._postCacheScriptDeriveLastArg;


    return new Promise((resolve, reject) => {

      // eslint-disable-next-line handle-callback-err
      const onCachedResults = (err, cachedResults) => {

        log.debug('mongoose.Query.prototype.exec(): cached result callback');
        // log.debug('callback:', callback);

        if (![undefined, null].includes(cachedResults)) {
          if (typeof cachedResults === 'string') {
            cachedResults = JSON.parse(cachedResults);
          }
          // we got a cached result!
          log.debug('mongoose.Query.prototype.exec(): got a cached result!');
          log.debug('mongoose.Query.prototype.exec(): typeof cachedResults:', typeof cachedResults);
          log.debug('mongoose.Query.prototype.exec(): cachedResults:', cachedResults);

          if (isCount) { // was the operation of type count?
            log.debug('mongoose.Query.prototype.exec(): was count-y');
            log.debug('mongoose.Query.prototype.exec(): Running callback()');
            callback(null, cachedResults);
            log.debug('mongoose.Query.prototype.exec(): Returning with resolve()');
            return resolve(cachedResults);
          }

          if (!isLean) {
            log.debug('mongoose.Query.prototype.exec(): wasn\'t lean');
            const model = mongoose.model(modelName);
            if (Array.isArray(cachedResults)) {
              log.debug('mongoose.Query.prototype.exec(): is an array');
              const l = cachedResults.length;
              for (let i = 0; i < l; i++) {
                cachedResults[i] = hydrateModel(model, cachedResults[i]);
              }
            }
            else {
              log.debug('mongoose.Query.prototype.exec(): not an array -- now hydrating');
              // log.debug('cachedResults:', cachedResults);
              cachedResults = hydrateModel(model, cachedResults);
            }
          }
          else {
            // log.debug('is lean -- recovering ObjectId');
            log.debug('mongoose.Query.prototype.exec(): is lean');
            // log.debug('cachedResults:', cachedResults);
            // cachedResults = recoverObjectId(mongoose, cachedResults);
            // log.debug('returned from recoverObjectId()');
          }

          log.debug('mongoose.Query.prototype.exec(): Running callback()');
          callback(null, cachedResults);
          log.debug('mongoose.Query.prototype.exec(): Returning with resolve()');
          return resolve(cachedResults);
        }

        log.debug('Didn\'t find a cached result :( -- fetching from mongo');

        mongooseExec
          .call(this)
          .then((results) => {
            // log.debug('results:', results);
            log.debug('mongoose.Query.prototype.exec(): Setting result in cache with cache.set()');
            if (derivedKey) {
              key = results[derivedKey];
              log.debug('mongoose.Query.prototype.exec(): Derived key result:', key);
            }
            gooseCache.set(key, results, ttl, () => {
              if (postCacheScript && !postCacheScriptDerivedKey) {
                log.debug('mongoose.Query.prototype.exec(): running postCacheScript');
                gooseCache.evalSha(...[postCacheScript, ...postCacheScriptArgs, () => callback(null, results) ]);
              }
              else if (postCacheScript && postCacheScriptDerivedKey) {
                key = results[postCacheScriptDerivedKey];
                log.debug('mongoose.Query.prototype.exec(): Derived key result:', key);
                log.debug('mongoose.Query.prototype.exec(): running postCacheScript');
                gooseCache.evalSha(...[postCacheScript, ...postCacheScriptArgs, key, () => callback(null, results)]);
              }
              else {
                callback(null, results);
              }
              return resolve(results);
            });
          })
          .catch((err) => {
            callback(err);
            reject(err);
          });
      };

      if (cacheGetScript) {
        log.debug('mongoose.Query.prototype.exec(): Getting results from cache with script', cacheGetScript);
        log.debug('mongoose.Query.prototype.exec(): script arguments:', cacheGetScriptArgs);
        const args = [ cacheGetScript, ...cacheGetScriptArgs, (err, results) => onCachedResults(err, results) ];
        gooseCache.evalSha(...args);
      }
      else {
        log.debug('mongoose.Query.prototype.exec(): Getting results from cache with cache.get(), key:', key);
        gooseCache.get(key, onCachedResults);
      }
    });
  };



  mongoose.Query.prototype.cache = function(ttl = 60, customKey = '') {
    log.debug('mongoose.Query.prototype.cache(): customKey:', customKey);
    log.debug('mongoose.Query.prototype.cache(): ttl:', ttl);
    if (typeof ttl === 'string') {
      customKey = ttl;
      ttl = 60;
    }

    this._ttl = ttl;
    this._key = customKey;
    return this;
  };



  mongoose.Query.prototype.setDerivedKey = function(derivedKey) {
    log.debug('mongoose.Query.prototype.setDerivedKey(): derivedKey:', derivedKey);
    this._derivedKey = derivedKey; // derivedKey means to take the key name from the results of the mongoose query
    return this;
  };



  mongoose.Query.prototype.cacheGetScript = function(script) {
    // will fetch results using this preloaded script hash instead of redis.get()
    this._cacheGetScript = script;
    log.debug('mongoose.Query.prototype.cacheGetScript(): script:', script);
    if (arguments.length > 1) {
      this._cacheGetScriptArgs = Array.prototype.slice.call(arguments).slice(1);
      log.debug('mongoose.Query.prototype.cacheGetScript(): _cacheGetScriptArgs:', this._cacheGetScriptArgs);
    }
    return this;
  };



  mongoose.Query.prototype.postCacheSetScript = function(script) {
    log.debug('mongoose.Query.prototype.postCacheSetScript(): script:', script);
    // will run this script after running redis.set()
    this._postCacheScript = script;
    if (arguments.length > 1) {
      this._postCacheScriptArgs = Array.prototype.slice.call(arguments).slice(1);
      log.debug('mongoose.Query.prototype.postCacheSetScript(): _postCacheScriptArgs:', this._postCacheScriptArgs);
    }
    return this;
  };



  mongoose.Query.prototype.postCacheSetDeriveLastArg = function(derivedKey) {
    log.debug('mongoose.Query.prototype.postCacheSetDeriveLastArg(): derivedKey:', derivedKey);
    // will run this script after running redis.set()
    this._postCacheScriptDeriveLastArg = derivedKey;
    return this;
  };



  mongoose.Query.prototype.getCacheKey = function() {
    log.debug('mongoose.Query.prototype.getCacheKey()');
    const key = {
      model: this.model.modelName,
      op: this.op,
      skip: this.options.skip,
      limit: this.options.limit,
      sort: this.options.sort,
      _options: this._mongooseOptions,
      _conditions: this._conditions,
      _fields: this._fields,
      _path: this._path,
      _distinct: this._distinct
    };

    return generateKey(key);
  };
};



function hydrateModel(model, data) {
  log.debug('mongoose.Query.prototype.hydrateModel()');
  return model.hydrate(data);
}

