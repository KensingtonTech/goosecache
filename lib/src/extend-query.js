'use strict';

const generateKey = require('./generate-key');
const recoverObjectId = require('./recover-objectid');
const noop = () => {};
let log;


module.exports = function(mongoose, gooseCache, logger) {
  const mongooseExec = mongoose.Query.prototype.exec;
  log = logger;

  /**
   * Executes GooseCache query chain.  No other methods will have any effect without this.
   */
  mongoose.Query.prototype.exec = async function(op, callback = noop ) {
    if (!this.hasOwnProperty('_ttl')) { // _ttl is set by .cache()
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

    let key = this._key || this.getCacheKey(); // don't change || to ??
    const ttl = this._ttl;
    const isCountOperation = ['count', 'countDocuments', 'estimatedDocumentCount'].includes(this.op);
    const isLeanQuery = this._mongooseOptions.lean;
    const modelName = this.model.modelName;
    const postCacheScriptArgs = this._postCacheScriptArgs ?? [];

    return await new Promise((resolve, reject) => {

      // eslint-disable-next-line handle-callback-err
      const onCachedResultsFound = (err, cachedResults) => {
        log.debug('mongoose.Query.prototype.exec(): cached result callback onCachedResultsFound()');

        if (![undefined, null].includes(cachedResults)) {
          if (typeof cachedResults === 'string') {
            cachedResults = JSON.parse(cachedResults);
          }
          // we got a cached result!
          log.debug('mongoose.Query.prototype.exec(): got a cached result!');
          log.debug('mongoose.Query.prototype.exec(): typeof cachedResults:', typeof cachedResults);
          log.debug('mongoose.Query.prototype.exec(): cachedResults:', cachedResults);

          if (isCountOperation) { // was the operation of type count?
            log.debug('mongoose.Query.prototype.exec(): was count-y');
            log.debug('mongoose.Query.prototype.exec(): Running callback()');
            callback(null, cachedResults);
            log.debug('mongoose.Query.prototype.exec(): Returning with resolve()');
            return resolve(cachedResults);
          }

          if (!isLeanQuery) {
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
              cachedResults = hydrateModel(model, cachedResults);
            }
          }
          else {
            log.debug('mongoose.Query.prototype.exec(): is lean');
            cachedResults = recoverObjectId(mongoose, cachedResults);
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
            log.debug('mongoose.Query.prototype.exec(): Setting result in cache with cache.set()');
            if (this._derivedKey) {
              key = results[this._derivedKey];
              log.debug('mongoose.Query.prototype.exec(): Derived key result:', key);
            }
            gooseCache.set(key, results, ttl, () => {
              if (this._postCacheScript && !this._postCacheScriptDeriveLastArg) {
                log.debug('mongoose.Query.prototype.exec(): running postCacheScript');
                gooseCache.evalSha(...[this._postCacheScript, ...postCacheScriptArgs, () => callback(null, results) ]);
              }
              else if (this._postCacheScript && this._postCacheScriptDeriveLastArg) {
                key = results[this._postCacheScriptDeriveLastArg];
                log.debug('mongoose.Query.prototype.exec(): Derived key result:', key);
                log.debug('mongoose.Query.prototype.exec(): running postCacheScript');
                gooseCache.evalSha(...[this._postCacheScript, ...postCacheScriptArgs, key, () => callback(null, results)]);
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

      if (this._cacheGetScript) {
        log.debug('mongoose.Query.prototype.exec(): Getting results from cache with script', this._cacheGetScript);
        log.debug('mongoose.Query.prototype.exec(): script arguments:', this._cacheGetScriptArgs);
        const args = [
          this._cacheGetScript,
          ...this._cacheGetScriptArgs,
          (err, results) => onCachedResultsFound(err, results)
        ];
        gooseCache.evalSha(...args);
      }
      else {
        log.debug('mongoose.Query.prototype.exec(): Getting results from cache with cache.get(), key:', key);
        gooseCache.get(key, onCachedResultsFound);
      }
    });
  };



  mongoose.Query.prototype.cache = function(ttl = 60, customKey = '') {
    log.debug('mongoose.Query.prototype.cache(): customKey:', customKey);
    if (typeof ttl === 'string') {
      customKey = ttl;
      ttl = 60;
    }
    this._ttl = ttl;
    this._key = customKey;
    return this;
  };



  mongoose.Query.prototype.setDerivedKey = function(documentKey) {
    log.debug('mongoose.Query.prototype.setDerivedKey(): documentKey:', documentKey);
    this._derivedKey = documentKey; // derivedKey means to take the key name from the results of the mongoose query
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
