/* 저장소: 작은 값은 localStorage(JSON), 큰 값(10년 시세·모델 결과)은 IndexedDB.
 * 어떤 저장소든 실패할 수 있으므로 모두 try/catch, 실패하면 메모리에만 둔다. */
(function (root) {
  'use strict';
  var PREFIX = 'mc.';
  var mem = {};

  var LS = {
    get: function (k, def) {
      try { var v = root.localStorage.getItem(PREFIX + k); return v == null ? def : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : def; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { root.localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del: function (k) { delete mem[k]; try { root.localStorage.removeItem(PREFIX + k); } catch (e) { /* ignore */ } }
  };

  var dbp = null, memIdb = {};
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        if (!root.indexedDB) return resolve(null);
        var req = root.indexedDB.open('market-compass', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  var IDB = {
    get: function (k) {
      return db().then(function (d) {
        if (!d) return memIdb[k];
        return new Promise(function (resolve) {
          try {
            var r = d.transaction('kv', 'readonly').objectStore('kv').get(k);
            r.onsuccess = function () { resolve(r.result); };
            r.onerror = function () { resolve(memIdb[k]); };
          } catch (e) { resolve(memIdb[k]); }
        });
      });
    },
    set: function (k, v) {
      memIdb[k] = v;
      return db().then(function (d) {
        if (!d) return false;
        return new Promise(function (resolve) {
          try {
            var tx = d.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(v, k);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(false); };
          } catch (e) { resolve(false); }
        });
      });
    },
    del: function (k) {
      delete memIdb[k];
      return db().then(function (d) {
        if (!d) return;
        try { d.transaction('kv', 'readwrite').objectStore('kv').delete(k); } catch (e) { /* ignore */ }
      });
    }
  };

  root.Store = { LS: LS, IDB: IDB };
})(typeof window !== 'undefined' ? window : globalThis);
