/** Keep the Worker global receiver; never pass the native fetch function as an unbound callback. */
export const runtimeFetch:typeof fetch=(input,init)=>globalThis.fetch(input,init);
