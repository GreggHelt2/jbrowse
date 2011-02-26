/**
*  Selection manager for bio-features
*     handles deselection of any ancestors/descendants of selected features
*        (which is desired behavior for feature selection)
*     assumes features have had their parent property set before calling selection manager methods
*  Sends selectionAdded() and selectionRemoved() function calls to listeners
*/
function FeatureSelectionManager()  {
    this.selected = [];
    this.listeners = [];
}


// adding a parent should remove all children
// adding a child should remove all parents
// attemptign to add a feature that's already part of the selection does nothing (and doesn't trigger listener calls)
FeatureSelectionManager.prototype.addToSelection = function(feat)  {
    console.log("called FeatureselectionManager.addToSelection()");
    // remove any children
    var selarray = this.selected;
    var slength = selarray.length;
    for (var sindex=0; sindex<slength; sindex++)  {
	var sfeat = selarray[sindex];
	if (sfeat.parent == feat)  {
	    this._removeSelectionAt(sindex, sfeat);
	    slength--;
	}
    }
    // remove any parents
    var parent = feat.parent;
    if (parent)  {  
	this.removeFromSelection(parent);
    }
    selarray.push(feat);
    var lislength = this.listeners.length;
    for (var lindex = 0; lindex<lislength; lindex++)  {
	var listener = this.listeners[lindex];
	listener.selectionAdded(feat);
    }
//    console.log("done calling FeatureselectionManager.addToSelection()");
}

/**
*  attempting to remove a feature that isn't selected does nothing (and doesn't trigger listener calls)
*/
FeatureSelectionManager.prototype.removeFromSelection = function(feat)  {
    var index = this.selected.indexOf(feat);
    if (index >= 0)  {
	this._removeSelectionAt(index, feat);
    }
}

FeatureSelectionManager.prototype._removeSelectionAt = function(index, feat)  {
    this.selected.splice(index, 1);
    var lislength = this.listeners.length;
    for (var lindex = 0; lindex<lislength; lindex++)  {
	var listener = this.listeners[lindex];
	listener.selectionRemoved(feat);
    }
}

/**
*  clearing an empty selection does nothing (and doesn't trigger listener calls)
*
*  intended for optimizing when selection is cleared, rather than 
*     multiple calls to removeSelectionAt (and subsequent multiple calls to listeners.selectionRemoved();
*/
FeatureSelectionManager.prototype.clearSelection = function()  {
    console.log("called FeatureselectionManager.clearSelection()");
    var previous_selected = this.selected;
    this.selected = [];
    var lislength = this.listeners.length;
    for (var lindex=0; lindex<lislength; lindex++)  {
	var listener = this.listeners[lindex];
	listener.selectionCleared(previous_selected);
    }
/*
    for (var sindex in previous_selected)  {
	var feat = previous_selected[sindex];
	for (var lindex in this.listeners)  {
	    var listener = this.listeners[lindex];
	    listener.selectionRemoved(feat);
	}
    }
*/
  //  console.log("done calling FeatureselectionManager.clearSelection()");
}

FeatureSelectionManager.prototype.isSelected = function(feat)  {
    return (this.selected.indexOf(feat) >= 0);
}

FeatureSelectionManager.prototype.getSelection = function()  {
    return this.selected;
}

FeatureSelectionManager.prototype.addListener = function(listener)  {
    this.listeners.push(listener);
}

FeatureSelectionManager.prototype.removeListener = function(listener)  {
    var index = this.listeners.indexOf(listener);
    this.listeners.splice(index, 1);
}
