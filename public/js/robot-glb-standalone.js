/* Same DB as src/utils/robotGlbIdb — for /model-viewer.html in a new tab */
(function (global) {
  var DB_NAME = "eurobot-web";
  var DB_VERSION = 2;
  var STORE = "glb-models";
  var ACTIVE_KEY = "robot-glb-active-id";

  function openDb(callback) {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = function () {
      callback(null);
    };
    req.onsuccess = function () {
      callback(req.result);
    };
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("sponsor-logos")) {
        var s = db.createObjectStore("sponsor-logos", { keyPath: "id" });
        s.createIndex("order", "order", { unique: false });
      }
    };
  }

  function getAllIds(db, done) {
    if (!db.objectStoreNames.contains(STORE)) {
      done([]);
      return;
    }
    var r = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    r.onsuccess = function () {
      var rows = r.result || [];
      done(
        rows.map(function (x) {
          return x.id;
        })
      );
    };
    r.onerror = function () {
      done([]);
    };
  }

  function loadId(db, id, setSrc) {
    var g = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    g.onsuccess = function () {
      var row = g.result;
      if (!row || !row.data) {
        setSrc(null);
        return;
      }
      var blob = new Blob([row.data], { type: "model/gltf-binary" });
      setSrc(URL.createObjectURL(blob));
    };
  }

  global.eurobotLoadGlbInViewer = function (setSrc) {
    function refresh() {
      openDb(function (db) {
        if (!db) {
          setSrc(null);
          return;
        }
        var cur = null;
        try {
          cur = localStorage.getItem(ACTIVE_KEY);
        } catch (e) {
          /* */
        }
        getAllIds(db, function (ids) {
          if (!ids.length) {
            setSrc(null);
            return;
          }
          if (!cur || ids.indexOf(cur) < 0) {
            cur = ids[0];
            try {
              localStorage.setItem(ACTIVE_KEY, cur);
            } catch (e2) {
              /* */
            }
          }
          loadId(db, cur, setSrc);
        });
      });
    }
    function nav(delta) {
      openDb(function (db) {
        if (!db) return;
        getAllIds(db, function (ids) {
          if (ids.length <= 1) return;
          var cur = null;
          try {
            cur = localStorage.getItem(ACTIVE_KEY);
          } catch (e) {
            /* */
          }
          var i = Math.max(0, ids.indexOf(cur || ids[0]));
          i = (i + delta + ids.length) % ids.length;
          var nextId = ids[i];
          try {
            localStorage.setItem(ACTIVE_KEY, nextId);
          } catch (e) {
            /* */
          }
          loadId(db, nextId, setSrc);
        });
      });
    }
    return { refresh: refresh, nav: nav };
  };
})(window);
