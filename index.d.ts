import { Mongoose } from 'mongoose';
import { RedisClient } from 'redis';



export interface GooseCacheOptions {
	engine?: 'memory' | 'redis' | 'file';
	port?: number;
	host?: string;
	password?: string;
	client?: RedisClient;
}



export declare class GooseCache {

	constructor(mongoose: Mongoose, cacheOptions: GooseCacheOptions): void;

	clearCache(customKey: string | null, cb: function): void;

	async clearCache(customKey: string | null): Promise<void>;

	get(key: string, cb?: function);

	set(key: string, value: any, ttl: number, cb?: function);

	evalSha(...args);

	redis: RedisClient;

}

export default GooseCache;



declare module 'mongoose' {
	// interface Query<T, DocType extends Document, QueryHelpers = {}> {
	// eslint-disable-next-line @typescript-eslint/ban-types
	interface Query<ResultType, DocType extends Document, QueryHelpers = {}> {
		// not cachegoose related fix, but useful. thanks to https://github.com/DefinitelyTyped/DefinitelyTyped/issues/34205#issuecomment-621976826
		orFail(err?: NativeError | (() => NativeError)): Query<NonNullable<ResultType>, DocType>;
		cache(ttl: number, customKey?: string): this;
		cache(customKey: string): this;
		setDerivedKey(derivedKey: string): this;
		cacheGetScript(sha: string, ...args: any): this;
		postCacheSetScript(sha: string, ...args: any): this;
		postCacheSetDeriveLastArg(derivedKey: string): this;
	}
}

