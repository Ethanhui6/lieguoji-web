/** Exact plain structured-clone values, including typed array identity and
 * bytes. No hashes, coercion, getter invocation or JSON omissions as evidence. */
export function sameCulture47Value(a:unknown,b:unknown):boolean {
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return false;
  if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){
    if(!ArrayBuffer.isView(a)||!ArrayBuffer.isView(b)||a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;
    const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
    if(!x.every((v,i)=>v===y[i]))return false;
  }
  const ka=Reflect.ownKeys(a),kb=Reflect.ownKeys(b);
  if(ka.length!==kb.length)return false;
  for(const k of ka){const x=Object.getOwnPropertyDescriptor(a,k),y=Object.getOwnPropertyDescriptor(b,k);if(!x||!y||!('value'in x)||!('value'in y)||!sameCulture47Value(x.value,y.value))return false;}
  return true;
}
