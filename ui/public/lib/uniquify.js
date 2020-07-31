const harden = x => x;
const uniqueEdgename = new Map();

export const uniquify = strongname => {
  if (!Array.isArray(strongname)) {
    return strongname;
  }
  const explode = [...strongname];
  let store = uniqueEdgename;
  let name = explode.shift();
  while (name !== undefined) {
    let ent;
    if (store.has(name)) {
      ent = store.get(name);
    } else {
      ent = [undefined, new Map()];
      store.set(name, ent);
    }

    if (!explode.length) {
      if (ent[0] === undefined) {
        // Install the unique edgename.
        ent[0] = harden([...strongname]);
        store.set(name, ent);
      }
      // eslint-disable-next-line prefer-destructuring
      strongname = ent[0];
    }

    // eslint-disable-next-line prefer-destructuring
    store = ent[1];
    name = explode.shift();
  }
  return strongname;
};
