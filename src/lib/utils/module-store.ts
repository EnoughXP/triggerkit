
let virtualModules = new Map<string, string>();

export function storeModule(id: string, content: string) {
  virtualModules.set(id, content);
}

export function getModule(id: string) {
  return virtualModules.get(id);
}

export function hasModule(id: string) {
  return virtualModules.has(id);
}

export function getAllModules() {
  return virtualModules;
}

export function clearModules() {
  virtualModules = new Map();
}