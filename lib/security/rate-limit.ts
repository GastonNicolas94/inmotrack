import { HttpError } from '@/lib/http-error';
export type LimitStore = { increment(key:string, windowSeconds:number): Promise<number> };
export async function enforceRateLimit(store:LimitStore,key:string,limit:number,windowSeconds:number):Promise<void> {
  if (!key || !Number.isSafeInteger(limit) || limit<1 || !Number.isSafeInteger(windowSeconds) || windowSeconds<1) throw new Error('Invalid limit');
  const count=await store.increment(key,windowSeconds);
  if (count>limit) throw new HttpError('RATE_LIMITED','Demasiadas solicitudes.',429);
}
