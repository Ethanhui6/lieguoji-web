/** Alea/Mash numeric core, adapted from the reviewed Alea 1.1 derivative.
 * Full MIT/original notice and BSD-3-Clause terms are in ./licenses/.
 * Each call owns all state; no ambient random source is read or modified. */
export function createAlea(seed: string): () => number {
  let mashState = 4022871197;
  const mash = (value: string) => {
    for (let index = 0; index < value.length; index++) {
      let fraction = 0.02519603282416938 * (mashState += value.charCodeAt(index));
      fraction -= mashState = fraction >>> 0;
      mashState = (fraction *= mashState) >>> 0;
      mashState += 4294967296 * (fraction - mashState);
    }
    return 2.3283064365386963e-10 * (mashState >>> 0);
  };
  let first = mash(' '), second = mash(' '), third = mash(' '), carry = 1;
  if ((first -= mash(seed)) < 0) first++;
  if ((second -= mash(seed)) < 0) second++;
  if ((third -= mash(seed)) < 0) third++;
  return () => {
    const value = 2091639 * first + 2.3283064365386963e-10 * carry;
    first = second; second = third; third = value - (carry = 0 | value); return third;
  };
}
