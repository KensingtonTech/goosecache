> This is a fork of [recachegoose](https://github.com/aalfiann/recachegoose) with these differences:
- Renamed to GooseCache
- Includes TypeScript definitions
- Breaking changes:
  - `goosecache.clearCache()` has been removed and replaced with `goosecache.clear()` and `goosecache.del(key: string)`
  - `goosecache.clear()` clears the entire cache.
  - `goosecache.del(key)` clears an individual cache key.
  - Callback support has been removed from all GooseCache methods.  They are now promise-only.
  - Note that callbacks are still supported on the `exec()` methods.
- Added additional methods to Model.Query prototype
  - setDerivedKey()
  - cacheGetScript()
  - postCacheSetScript()
  - postCacheSetDeriveLastArg()
- Supports calls to custom Redis Lua scripts which have been loaded by script load, both for fetching documents with a Lua script, and for running a script immediately following a cache set, say for instance, for post-processing / indirection.
- Added ability to access Redis client through getter `gooseCache.redis`
- Eliminated redundant calls to Redis
- Eliminated unneeded additional Cache layer in favour of a single GooseCache class
- A prefix is no longer added to Redis keys

# GooseCache #

#### Mongoose cacheing module. ####

## About ##

A Mongoose cacheing module, with Redis Lua scripting support.

> Important:  
  Compatible with Mongoose >= 6.0.0 < 7.

## Usage ##

- Use In Memory
```javascript
const mongoose = require('mongoose');
const goosecache = require('goosecache');

goosecache(
  mongoose,
  {
    engine: 'memory'
  }
);
```

- Use File
```javascript
const mongoose = require('mongoose');
const goosecache = require('goosecache');

goosecache(
  mongoose,
  {
    engine: 'file'
  }
);
```

- Use Redis
```javascript
const mongoose = require('mongoose');
const goosecache = require('goosecache');

goosecache(
  mongoose,
  {
    engine: 'redis',
    port: 6379,
    host: 'localhost'
  }
);

// or with Redis client provided
goosecache(
  mongoose,
  {
    engine: 'redis',
    client: require('redis').createClient('redis://localhost:6379')
  }
);
```

- Set Cache
```typescript
await Record
  .find({ some_condition: true })
  .cache(30) // The number of seconds to cache the query.  Defaults to 60 seconds.
  .exec(callback?: (err, records) => void); // You may use callback or promise

await Record
  .aggregate()
  .group({ total: { $sum: '$some_field' } })
  .cache(0) // Explicitly passing in 0 will cache the results indefinitely.
  .exec(callback?: (err, aggResults) => void); // You may use callback or promise
```

You can also pass a custom key into the `.cache()` method, which you can then use later to clear the cached content.

```typescript
const userId = '1234567890';

const results = await Children
  .find({ parentId: userId })
  .cache(0, userId + '-children') /* Will create a redis entry          */
  .exec(callback?: (err, aggResults) => void); // with the cache key '1234567890-children'

// Clear the parent's cache, since a new child has been added.
const child = await ChildrenSchema.post('save');
await goosecache.del(child.parentId + '-children');
```

Insert `.cache()` into the queries you want to cache, and they will be cached.  Works with `select`, `lean`, `sort`, and anything else that will modify the results of a query.

## Clearing the cache ##

The cache can be cleared in two ways:

* `gooseCache.clear()` - Clears entire cache.
* `gooseCache.del(key: string)` - Clears a specific cache key.

If you want to clear the cache for a specific query, you must specify the cache key yourself:

```typescript
async function getChildrenByParentId(parentId: string) {
  Children
    .find({ parentId })
    .cache(0, `${parentId}_children`)
    .exec();
}

async function clearChildrenByParentIdCache(parentId: string) {
  await goosecache.del(`${parentId}_children`);
}
```

## Cacheing Populated Documents ##

When a document is returned from the cache, goosecache will [hydrate](http://mongoosejs.com/docs/api.html#model_Model.hydrate) it, which initializes it's virtuals/methods. Hydrating a populated document will discard any populated fields (see [Automattic/mongoose#4727](https://github.com/Automattic/mongoose/issues/4727)). To cache populated documents without losing child documents, you must use `.lean()`, however if you do this you will not be able to use any virtuals/methods (it will be a plain object).

## Test ##
npm test
