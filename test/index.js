/* eslint-disable prefer-arrow-callback */
'use strict';

require('should');

const mongoose = require('mongoose');
const { GooseCache } = require('../dist');
const { v4: uuidV4 } = require('uuid');
const Schema = mongoose.Schema;
let goosecache;
let TestSchema;
let TestSchemaTextId;
let TestModel;
let TestModelTextId;
let db;

describe('goosecache', function() {
  before(async function() {
    goosecache = new GooseCache(mongoose);
    await mongoose.connect('mongodb://admin:password@mongo/');
    db = mongoose.connection;
    db.on('error', (err) => {
      throw err;
    });
    TestSchema = new Schema(
      {
        num: Number,
        str: String,
        date: {
          type: Date,
          default: Date.now
        }
      },
      {
        strict: true,
        strictQuery: false
      }
    );
    TestSchemaTextId = new Schema(
      {
        _id: {
          type: String,
          default: uuidV4
        },
        num: Number,
        str: String,
        date: {
          type: Date,
          default: Date.now
        }
      },
      {
        strict: true,
        strictQuery: false
      }
    );

    TestModel = mongoose.model('Test', TestSchema);
    TestModelTextId = mongoose.model('TestTextId', TestSchemaTextId);
  });

  beforeEach(async function() {
    await generate(10);
  });

  afterEach(async function() {
    await Promise.all([
      TestModel.deleteMany(),
      TestModelTextId.deleteMany()
    ]);
    await goosecache.clearCache(null);
  });

  it.skip('should throw an error if the hydrate method is undefined', function() {
    const mongoose = {
      Model: {
        hydrate: undefined
      }
    };
    (() => new GooseCache(mongoose)).should.throw();
  });

  it.skip('should not throw an error if the hydrate method exists', function() {
    (() => new GooseCache(mongoose)).should.not.throw();
  });

  it('should have cache method after initialization', async function() {
    await TestModel.find({}).cache.should.be.a.Function;
  });

  it('should cache a simple query that uses callbacks', async function() {
    let res = await getAll(60);
    res.length.should.equal(10);
    await generate(10);
    res = await getAll(60);
    await res.length.should.equal(10);
  });

  it('should cache a simple query that uses promises', async function() {
    const res = await getAll(60);
    res.length.should.equal(10);
    await generate(10);
    const cachedRes = await getAll(60);
    cachedRes.length.should.equal(10);
  });

  it('should not cache the same query w/out a ttl defined', async function() {
    const res = await getAll(60);
    res.length.should.equal(10);
    await generate(10);
    const nonCachedResponse = await getAllNoCache();
    nonCachedResponse.length.should.equal(20);
  });

  it('should return a Mongoose model from cached and non-cached results', async function() {
    const res = await getAll(60);
    const first = res[0];
    const res2 = await getAll(60);
    const cachedFirst = res2[0];
    first.constructor.name.should.equal('model');
    cachedFirst.constructor.name.should.equal('model');
    res[0].isNew.should.be.false;
    res2[0].isNew.should.be.false;
  });

  it('should return lean models from cached and non-cached results', async function() {
    const lean = await getAllLean(10);
    lean.length.should.equal(10);
    await generate(10);
    const cachedLean = await getAllLean(10);
    cachedLean.length.should.equal(10);
    lean[0].constructor.name.should.not.equal('model');
    cachedLean[0].constructor.name.should.not.equal('model');
  });

  it('should cache a query that returns no results', async function() {
    const empty = await getNone(60);
    empty.length.should.equal(0);
    await generate(10);
    const cachedEmpty = await getNone(60);
    cachedEmpty.length.should.equal(0);
  });

  it('should distinguish between lean and non-lean for the same conditions', async function() {
    const res = await getAll(60);
    res.length.should.equal(10);
    await generate(10);
    const cachedRes = await getAll(60);
    cachedRes.length.should.equal(10);
    const nonCachedLean = await getAllLean(60);
    nonCachedLean[0].constructor.name.should.not.equal('model');
  });

  it('should correctly cache queries using skip', async function() {
    const res = await getWithSkip(1, 60);
    res.length.should.equal(9);
    await generate(10);
    const cachedRes = await getWithSkip(1, 60);
    cachedRes.length.should.equal(9);
    const nonCached = await getWithSkip(2, 60);
    nonCached.length.should.equal(18);
  });

  it('should correctly cache queries using limit', async function() {
    const res = await getWithLimit(5, 60);
    res.length.should.equal(5);
    await TestModel.deleteMany();
    const cached = await getWithLimit(5, 60);
    cached.length.should.equal(5);
    await generate(10);
    const nonCached = await getWithLimit(4, 60);
    nonCached.length.should.equal(4);
  });

  it('should correctly cache the same query with different condition orders', async function() {
    const res = await getWithUnorderedQuery(60);
    res.length.should.equal(10);
    await generate(10);
    const cached = await getWithUnorderedQuery(60);
    cached.length.should.equal(10);
  });

  it('should cache a findOne query', async function() {
    const one = await getOne(60);
    Boolean(one).should.be.true;
    await TestModel.deleteMany();
    const cachedOne = await getOne(60);
    Boolean(cachedOne).should.be.true;
  });

  it('should cache a regex condition properly', async function() {
    const res = await getAllWithRegex(60);
    res.length.should.equal(10);
    await generate(10);
    const cached = await getAllWithRegex(60);
    cached.length.should.equal(10);
    const nonCached = await getNoneWithRegex(60);
    nonCached.length.should.equal(0);
  });

  it('should cache a query rerun many times', async function() {
    const res = await getAll(60);
    res.length.should.equal(10);
    await generate(10);
    await Promise.all(
      new Array(20).join('.').split('').map(
        async () => await getAll(60)
      )
    );
    const cached = await getAll(60);
    cached.length.should.equal(10);
  });

  it('should expire the cache', async function() {
    await getAll(1);
    setTimeout(
      async () => {
        const res = await getAll(1);
        Boolean(res._fromCache).should.be.false;
      },
      1200
    );
  });

  it('should cache aggregate queries that use callbacks', async (done) => {
    aggregate(
      60,
      async (err, res) => {
        if (err) {
          return done(err);
        }
        res[0].total.should.equal(45);
        await generate(10);
        aggregate(
          60,
          (err, cached) => {
            if (err) {
              return done(err);
            }
            cached[0].total.should.equal(45);
            done();
          }
        );
      }
    );
  });

  it('should cache aggregate queries that use Promises', async function() {
    const [res] = await aggregate(60);
    res.total.should.equal(45);
    await generate(10);
    const [cached] = await aggregate(60);
    cached.total.should.equal(45);
  });

  it('should clear a custom cache key', async function() {
    const res = await getAllCustomKey(60, 'custom-key');
    res.length.should.equal(10);
    await generate(10);
    const cached = await getAllCustomKey(60, 'custom-key');
    cached.length.should.equal(10);
    await goosecache.clearCache('custom-key');
    const notCached = await getAllCustomKey(60, 'custom-key');
    notCached.length.should.equal(20);
  });

  it('should cache a count query', async function() {
    const res = await count(60);
    res.should.equal(10);
    await generate(10);
    const cached = await count(60);
    cached.should.equal(10);
  });

  it('should cache a count query with zero results', async function() {
    await TestModel.deleteMany();
    const res = await count(60);
    res.should.equal(0);
    await generate(2);
    const cached = await count(60);
    cached.should.equal(0);
  });

  it('should cache a countDocuments query', async function() {
    const res = await countDocuments(60);
    res.should.equal(10);
    await generate(10);
    const cached = await countDocuments(60);
    cached.should.equal(10);
  });

  it('should cache a countDocuments query with zero results', async function() {
    await TestModel.deleteMany();
    const res = await countDocuments(60);
    res.should.equal(0);
    await generate(2);
    const cached = await countDocuments(60);
    cached.should.equal(0);
  });

  it('should cache a estimatedDocumentCount query', async function() {
    const res = await estimatedDocumentCount(60);
    res.should.equal(10);
    await generate(10);
    const cached = await estimatedDocumentCount(60);
    cached.should.equal(10);
  });

  it('should cache a estimatedDocumentCount query with zero results', async function() {
    await TestModel.deleteMany();
    const res = await estimatedDocumentCount(60);
    res.should.equal(0);
    await generate(2);
    const cached = await estimatedDocumentCount(60);
    cached.should.equal(0);
  });

  it('should correctly cache a query with a sort order', async function() {
    const res = await getAllSorted({ num: 1 });
    res.length.should.equal(10);
    await generate(10);
    const cached = await getAllSorted({ num: 1 });
    cached.length.should.equal(10);
    const diffSort = await getAllSorted({ num: -1 });
    diffSort.length.should.equal(20);
  });

  it('should return similar _id in cached array result for lean', async function() {
    const originalRes = await getAllLean(60);
    const cachedRes = await getAllLean(60);
    const originalConstructor = originalRes[0]._id.constructor.name.should;
    const cachedConstructor = cachedRes[0]._id.constructor.name.should;
    originalConstructor.should.deepEqual(cachedConstructor);
  });

  it('should return similar _id in cached array result for lean (string _id)', async function() {
    const originalRes = await getAllLean(60, TestModelTextId);
    const cachedRes = await getAllLean(60, TestModelTextId);
    const originalConstructor = originalRes[0]._id.constructor.name.should;
    const cachedConstructor = cachedRes[0]._id.constructor.name.should;
    originalConstructor.should.deepEqual(cachedConstructor);
  });

  it('should return similar _id in one cached result for lean', async function() {
    const originalRes = await getOneLean(60);
    const cachedRes = await getOneLean(60);
    const originalConstructor = originalRes._id.constructor.name.should;
    const cachedConstructor = cachedRes._id.constructor.name.should;
    originalConstructor.should.deepEqual(cachedConstructor);
  });

  it('should return similar _id in one cached result for lean (string _id)', async function() {
    const originalRes = await getOneLean(60, TestModelTextId);
    const cachedRes = await getOneLean(60, TestModelTextId);
    const originalConstructor = originalRes._id.constructor.name.should;
    const cachedConstructor = cachedRes._id.constructor.name.should;
    originalConstructor.should.deepEqual(cachedConstructor);
  });

  it('should return similar _id in cached array result for aggregate', async function() {
    const originalRes = await aggregateAll(60);
    const cachedRes = await aggregateAll(60);
    const originalConstructor = originalRes[0]._id.constructor.name.should;
    const cachedConstructor = cachedRes[0]._id.constructor.name.should;
    originalConstructor.should.deepEqual(cachedConstructor);
  });

  it('should return similar _id in cached array result for aggregate (string _id)', async function() {
    const originalRes = await aggregateAll(60, TestModelTextId);
    const cachedRes = await aggregateAll(60, TestModelTextId);
    const originalConstructor = originalRes[0]._id.constructor.name.should;
    const cachedConstructor = cachedRes[0]._id.constructor.name.should;
    originalConstructor.should.deepEqual(cachedConstructor);
  });
});

async function getAll(ttl) {
  return await TestModel.find({}).cache(ttl).exec();
}

async function aggregateAll(ttl) {
  return await TestModel.aggregate([
    { $match: {} }
  ])
    .cache(ttl)
    .exec();
}

async function getAllCustomKey(ttl, key) {
  return await TestModel.find({}).cache(ttl, key).exec();
}

async function getAllNoCache() {
  return await TestModel.find({}).exec();
}

async function getAllLean(ttl, model = TestModel) {
  return await model.find({}).lean().cache(ttl).exec();
}

async function getOne(ttl) {
  return await TestModel.findOne({ num: { $gt: 2 } }).cache(ttl).exec();
}

async function getOneLean(ttl, model = TestModel) {
  return await model.findOne({ num: { $gt: 2 } }).lean().cache(ttl).exec();
}

async function getWithSkip(skip, ttl) {
  return await TestModel.find({}).skip(skip).cache(ttl).exec();
}

async function getWithLimit(limit, ttl) {
  return await TestModel.find({}).limit(limit).cache(ttl).exec();
}

async function getNone(ttl) {
  return await TestModel.find({ notFound: true }).cache(ttl).exec();
}

async function getAllWithRegex(ttl) {
  return await TestModel.find({ str: { $regex: /\d/ } }).cache(ttl).exec();
}

async function getNoneWithRegex(ttl) {
  return await TestModel.find({ str: { $regex: /\d\d/ } }).cache(ttl).exec();
}

async function getWithUnorderedQuery(ttl) {
  getWithUnorderedQuery.flag = !getWithUnorderedQuery.flag;
  if (getWithUnorderedQuery.flag) {
    return await TestModel.find(
      {
        num: {
          $exists: true
        },
        str: {
          $exists: true
        }
      }
    )
      .cache(ttl)
      .exec();
  }
  return await TestModel.find(
    {
      str: {
        $exists: true
      },
      num: {
        $exists: true
      }
    }
  )
    .cache(ttl)
    .exec();
}

async function getAllSorted(sortObj) {
  return await TestModel.find({})
    .sort(sortObj)
    .cache(60)
    .exec();
}

async function count(ttl, cb) {
  // collection.count was deprecated in new mongoose version, so we change it with countDocuments
  return await TestModel.find({})
    .cache(ttl)
    .countDocuments()
    .exec(cb);
}
async function countDocuments(ttl) {
  return await TestModel.find({})
    .cache(ttl)
    .countDocuments()
    .exec();
}
async function estimatedDocumentCount(ttl) {
  return await TestModel.find({})
    .cache(ttl)
    .estimatedDocumentCount()
    .exec();
}

async function aggregate(ttl, cb) {
  return await TestModel.aggregate()
    .group({ _id: null, total: { $sum: '$num' } })
    .cache(ttl)
    .exec(cb);
}

async function generate(amount) {
  const records = [];
  let count = 0;
  while (count < amount) {
    records.push({
      num: count,
      str: count.toString()
    });
    count++;
  }
  await Promise.all([
    TestModel.create(records),
    TestModelTextId.create(records)
  ]);
}
