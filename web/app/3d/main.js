TCAD = {};

TCAD.App = function() {

  this.id = "DEFAULT";
  this.bus = new TCAD.Bus();
  this.viewer = new TCAD.Viewer(this.bus);
  this.ui = new TCAD.UI(this);
  this.craft = new TCAD.Craft(this);

  var box = TCAD.utils.createSolidMesh(TCAD.utils.createBox(500));
  this.viewer.scene.add( box );
  this._refreshSketches();
  this.viewer.render();

  var viewer = this.viewer;
  var app = this;
  function storage_handler(evt) {
//      console.log('The modified key was '+evt.key);
//      console.log('The original value was '+evt.oldValue);
//      console.log('The new value is '+evt.newValue);
//      console.log('The URL of the page that made the change was '+evt.url);
//      console.log('The window where the change was made was '+evt.source);

    var prefix = "TCAD.projects."+app.id+".sketch.";
    if (evt.key.indexOf(prefix) < 0) return;
    var sketchFaceId = evt.key.substring(prefix.length);

    for (var oi = 0; oi < viewer.scene.children.length; ++oi) {
      var obj = viewer.scene.children[oi];
      if (obj.geometry !== undefined && obj.geometry.polyFaces !== undefined) {
        for (var i = 0; i < box.geometry.polyFaces.length; i++) {
          var sketchFace = box.geometry.polyFaces[i];
          if (sketchFace.id == sketchFaceId) {
            var geom = TCAD.workbench.readSketchGeom(JSON.parse(evt.newValue));
            sketchFace.syncSketches(geom);
            viewer.render();
            break;
          }
        }
      }
    }
  }

  window.addEventListener('storage', storage_handler, false);
};

TCAD.App.prototype.faceStorageKey = function(polyFaceId) {
  return "TCAD.projects."+this.id+".sketch." + polyFaceId;
};

TCAD.App.prototype.sketchFace = function() {
  if (this.viewer.selectionMgr.selection.length == 0) {
    return;
  }
  var polyFace = this.viewer.selectionMgr.selection[0];
  var faceStorageKey = this.faceStorageKey(polyFace.id);

  var savedFace = localStorage.getItem(faceStorageKey);
  var data;
  if (savedFace == null) {
    data = {};
  } else {
    data = JSON.parse(savedFace);
  }
  data.boundary = {lines : [], arcs : []};
  function sameSketchObject(a, b) {
    if (a.sketchConnectionObject === undefined || b.sketchConnectionObject === undefined) {
      return false;
    }
    return a.sketchConnectionObject.id === b.sketchConnectionObject.id;
  }
  var paths = [];
  polyFace.polygon.collectPaths(paths);
  var _2dTr = polyFace.polygon.get2DTransformation();
  for (var i = 0; i < paths.length; i++) {
    var path = paths[i];
    var shift = 0;
    TCAD.utils.iteratePath(path, 0, function(a, b, ai, bi) {
      shift = bi;
      return sameSketchObject(a, b);
    });

    function addSegment(a, b) {
      data.boundary.lines.push({
        a : {x : a.x, y: a.y},
        b : {x : b.x, y: b.y}
      });
    }
    function addArc(arc) {
      if (arc.length < 2) {
        return;
      }
      var a = arc[0], b = arc[arc.length - 1];
      if (arc.length == 2) {
        addSegment(a, b);
        return;
      }
      var mid = (arc.length / 2) >> 0;
      var c = TCAD.math.circleFromPoints(arc[0], arc[mid], arc[arc.length-1]);
      if (c == null) {
        return;
      }
      if (!TCAD.geom.isCCW([arc[0], arc[mid], arc[arc.length-1]])) {
        var t = a;
        a = b;
        b = t;
      }
      data.boundary.arcs.push({
        a : {x : a.x, y: a.y},
        b : {x : b.x, y: b.y},
        c : {x : c.x, y : c.y}
      });
    }
    var currSko = null;
    var arc = null;
    TCAD.utils.iteratePath(path, shift+1, function(a, b, ai, bi, iterNumber, path) {
      var isArc = a.sketchConnectionObject !== undefined && a.sketchConnectionObject._class == 'TCAD.TWO.Arc';
      var a2d = _2dTr.apply(a);
      if (isArc) {
        if (currSko !== a.sketchConnectionObject.id) {
          currSko = a.sketchConnectionObject.id;
          if (arc != null) {
            arc.push(a2d);
            addArc(arc);
          }
          arc = [];
        }
        arc.push(a2d);
        if (iterNumber === path.length - 1) {
          arc.push(_2dTr.apply(b));
          addArc(arc);
        }
      } else {
        if (arc != null) {
          arc.push(a2d);
          addArc(arc);
          arc = null;
        }
        currSko = null;
        addSegment(a2d, _2dTr.apply(b));
      }
      return true;
    });
  }

  localStorage.setItem(faceStorageKey, JSON.stringify(data));

  window.open("sketcher.html#" + faceStorageKey.substring(14), "Edit Sketch", "height=900,width=1200");
};

TCAD.App.prototype.extrude = function() {

  if (this.viewer.selectionMgr.selection.length == 0) {
    return;
  }
  var polyFace = this.viewer.selectionMgr.selection[0];
  var height = prompt("Height", "50");
  if (!height) return;

  var app = this;
  var solids = [polyFace.solid];
  this.craft.modify({
    type: 'PAD',
    solids : solids,
    face : polyFace,
    height : height
  });
};

TCAD.App.prototype.cut = function() {

  if (this.viewer.selectionMgr.selection.length == 0) {
    return;
  }
  var polyFace = this.viewer.selectionMgr.selection[0];
  var depth = prompt("Depth", "50");
  if (!depth) return;

  var app = this;
  var solids = [polyFace.solid];
  this.craft.modify({
    type: 'CUT',
    solids : solids,
    face : polyFace,
    depth : depth
  });
};

TCAD.App.prototype.refreshSketches = function() {
  this._refreshSketches();
  this.viewer.render();
};

TCAD.App.prototype._refreshSketches = function() {
  for (var oi = 0; oi < this.viewer.scene.children.length; ++oi) {
    var obj = this.viewer.scene.children[oi];
    if (obj.geometry !== undefined && obj.geometry.polyFaces !== undefined) {
      for (var i = 0; i < obj.geometry.polyFaces.length; i++) {
        var sketchFace = obj.geometry.polyFaces[i];
        var faceStorageKey = this.faceStorageKey(sketchFace.id);
        var savedFace = localStorage.getItem(faceStorageKey);
        if (savedFace != null) {
          var geom = TCAD.workbench.readSketchGeom(JSON.parse(savedFace));
          sketchFace.syncSketches(geom);
        }
      }
    }
  }
};

TCAD.App.prototype.save = function() {

  var polyFace = this.viewer.selectionMgr.selection[0];
  var height = prompt("Height", "50");
};

TCAD.Bus = function() {
  this.listeners = {};
};

TCAD.Bus.prototype.subscribe = function(event, callback) {
  var listenerList = this.listeners[event];
  if (listenerList === undefined) {
    listenerList = [];
    this.listeners[event] = listenerList;
  }
  listenerList.push(callback);
};

TCAD.Bus.prototype.notify = function(event, data) {
  var listenerList = this.listeners[event];
  if (listenerList !== undefined) {
    for (var i = 0; i < listenerList.length; i++) {
      listenerList[i](data);
    }
  }

};