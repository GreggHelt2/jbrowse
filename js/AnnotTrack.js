function AnnotTrack(trackMeta, url, refSeq, browserParams) {
    //trackMeta: object with:
    //            key:   display text track name
    //            label: internal track name (no spaces, odd characters)
    //url: URL of the track's JSON file
    //refSeq: object with:
    //         start: refseq start
    //         end:   refseq end
    //browserParams: object with:
    //                changeCallback: function to call once JSON is loaded
    //                trackPadding: distance in px between tracks
    //                baseUrl: base URL for the URL in trackMeta


    FeatureTrack.call(this, trackMeta, url, refSeq, browserParams);

    var thisObj = this;
    /*
    this.subfeatureCallback = function(i, val, param) {
        thisObj.renderSubfeature(param.feature, param.featDiv, val);
    };
*/
    // define fields meta data
    this.fields = AnnotTrack.fields;
    this.comet_working = true;
    this.remote_edit_working = false;

    this.annotMouseDown = function(event)  {
	thisObj.onAnnotMouseDown(event);
    }

    annot_context_menu = new dijit.Menu({});
    annot_context_menu.addChild(new dijit.MenuItem(
    {
    	label: "Delete",
    	onClick: function() {
    	    thisObj.deleteSelectedFeatures();
        }
    }
    ));
    annot_context_menu.addChild(new dijit.MenuItem( 
    {
    	label: "..."
    }
    ));
    annot_context_menu.startup();
}



// Inherit from FeatureTrack 
AnnotTrack.prototype = new FeatureTrack();

/**
*  only set USE_COMET true if server supports Servlet 3.0 comet-style long-polling, and web app is propertly set up for async
*    otherwise if USE_COMET is set to true, will cause server-breaking errors
*  
*/
AnnotTrack.USE_COMET = false;

/**
*  set USE_LOCAL_EDITS = true to bypass editing calls to AnnotationEditorService servlet and attempt 
*    to create similar annotations locally
*  useful when AnnotationEditorService is having problems, or experimenting with something not yet completely implemented server-side
*/
AnnotTrack.USE_LOCAL_EDITS = false;

AnnotTrack.creation_count = 0;
AnnotTrack.selectedFeatures = [];

AnnotTrack.fields = {"start": 0, "end": 1, "strand": 2, "name": 3};

dojo.require("dijit.Menu");
dojo.require("dijit.MenuItem");
var annot_context_menu;
var context_path = "/ApolloWeb";
// var context_path = "";


dojo.addOnLoad( function()  {
/*
    annot_context_menu = new dijit.Menu({});
    annot_context_menu.addChild(new dijit.MenuItem(
    {
    	label: "Delete",
    	onClick: function() {
    	    AnnotTrack.deleteSelectedFeatures();
        }
    }
    ));
    annot_context_menu.addChild(new dijit.MenuItem( 
    {
    	label: "..."
    }
    ));
    annot_context_menu.startup();
*/
} );

console.log("annot context menu created...");

AnnotTrack.prototype.loadSuccess = function(trackInfo) {
    FeatureTrack.prototype.loadSuccess.call(this, trackInfo);
	
    var track = this;
    var features = this.features;
    
    dojo.xhrPost( {
	postData: '{ "track": "' + track.name + '", "operation": "get_features" }',
	url: context_path + "/AnnotationEditorService",
	handleAs: "json",
	timeout: 5 * 1000, // Time in milliseconds
	// The LOAD function will be called on a successful response.
	load: function(response, ioArgs) { //
	    var responseFeatures = response.features;
	    for (var i = 0; i < responseFeatures.length; i++) {
		var jfeat = JSONUtils.createJBrowseFeature(responseFeatures[i], track.fields, track.subFields);
		features.add(jfeat, responseFeatures[i].uniquename);
		// console.log("responseFeatures[0].uniquename: " + responseFeatures[0].uniquename);
	    }
	    track.hideAll();
	    track.changed();
	},
	// The ERROR function will be called in an error case.
	error: function(response, ioArgs) { //
	    console.log("Annotation server error--maybe you forgot to login to the server?")
	    console.error("HTTP status code: ", ioArgs.xhr.status); //
	    //dojo.byId("replace").innerHTML = 'Loading the resource from the server did not work'; //
	    track.remote_edit_working = false;
	    return response; //
	}
    });
	
    if (AnnotTrack.USE_COMET)  {
	this.createAnnotationChangeListener();
    }
    this.makeTrackDroppable();
}

AnnotTrack.prototype.createAnnotationChangeListener = function() {
    var track = this;
    var features = this.features;

    dojo.xhrGet( {
	url: context_path + "/AnnotationChangeNotificationService",
	content: {
	    track: track.name
	},
	handleAs: "json",
	timeout: 1000 * 1000, // Time in milliseconds
	// The LOAD function will be called on a successful response.
	load: function(response, ioArgs) {
	    if (response.operation == "ADD") {
	    	var responseFeatures = response.features;
//	    	var featureArray = JSONUtils.convertJsonToFeatureArray(responseFeatures[0]);
	    	var featureArray = JSONUtils.createJBrowseFeature(responseFeatures[0], track.fields, track.subFields);

	    	var id = responseFeatures[0].uniquename;
	    	if (features.featIdMap[id] == null) {
	    		// note that proper handling of subfeatures requires annotation trackData.json resource to
	    		//    set sublistIndex one past last feature array index used by other fields
	    		//    (currently Annotations always have 6 fields (0-5), so sublistIndex = 6
	    		features.add(featureArray, id);
	    	}
	    }
	    else if (response.operation == "DELETE") {

		var responseFeatures = response.features;
                        for (var i = 0; i < responseFeatures.length; ++i) {
                              var id_to_delete = responseFeatures[i].uniquename;
                              features.delete(id_to_delete);
			}
	    }
		track.hideAll();
		track.changed();
	    track.createAnnotationChangeListener();
	},
	// The ERROR function will be called in an error case.
	error: function(response, ioArgs) { //
	    console.error("HTTP status code: ", ioArgs.xhr.status); //
	    track.comet_working = false;
	    return response;
	}
    });

}

AnnotTrack.annot_under_mouse = null;

/**
 *  overriding renderFeature to add event handling right-click context menu
 */
AnnotTrack.prototype.renderFeature = function(feature, uniqueId, block, scale,
					      containerStart, containerEnd) {
    var track = this;
    var featDiv = FeatureTrack.prototype.renderFeature.call(this, feature, uniqueId, block, scale,
							    containerStart, containerEnd);
    if (featDiv && featDiv != null)  {
	annot_context_menu.bindDomNode(featDiv);
	//    var track = this;
	$(featDiv).bind("mouseenter", function(event)  {
	    /* "this" in mousenter function will be featdiv */
	    AnnotTrack.annot_under_mouse = this;
	    console.log("annot under mouse: ");
	    console.log(AnnotTrack.annot_under_mouse);
	} );
	$(featDiv).bind("mouseleave", function(event)  {
	    console.log("no annot under mouse: ");
	    AnnotTrack.annot_under_mouse = null;
	} );
	// console.log("added context menu to featdiv: ", uniqueId);
	dojo.connect(featDiv, "oncontextmenu", this, function(e) {
    	    if (AnnotTrack.selectedFeatures.length == 1) {
    		AnnotTrack.selectedFeatures = [];
    	    }
//    	    AnnotTrack.selectedFeatures.push([feature, track.name]);
    	    AnnotTrack.selectedFeatures.push(feature);
	});
	// console.log("added context menu to featdiv: ", uniqueId);
	
	$(featDiv).droppable(  {
	    accept: ".selected-feature",   // only accept draggables that are selected feature divs	
	    tolerance: "pointer", 
	    hoverClass: "annot-drop-hover", 
	    drop: function(event, ui)  {
		// ideally in the drop() on annot div is where would handle adding feature(s) to annot, 
		//   but JQueryUI droppable doesn't actually call drop unless draggable helper div is actually 
		//   over the droppable -- even if tolerance is set to pointer
		//      tolerance=pointer will trigger hover styling when over droppable
		//      BUT location of pointer still does not influence actual dropping and drop() call
		// therefore getting around this by handling hover styling here based on pointer over annot, 
		//      but drop-to-add part is handled by whole-track droppable, and uses annot_under_mouse 
		//      tracking variable to determine if drop was actually on top of an annot instead of 
		//      track whitespace
		console.log("dropped feature on annot:");
		console.log(this);
	    }
	    
	} );
    }
    return featDiv;
}

/** AnnotTrack subfeatures are similar to DAS subfeatures, so handled similarly */
/* AnnotTrack.prototype.handleSubFeatures = function(feature, featDiv,
    displayStart, displayEnd, block)  {
    var subfeatures = this.fields["subfeatures"];
    for (var i = 0; i < feature[subfeatures].length; i++) {
	var subfeature = feature[subfeatures][i];
	this.renderSubfeature(feature, featDiv, subfeature, displayStart, displayEnd, block);
    }
}
*/

AnnotTrack.prototype.renderSubfeature = function(feature, featDiv, subfeature,
						 displayStart, displayEnd, block) {
    var subdiv = FeatureTrack.prototype.renderSubfeature.call(this, feature, featDiv, subfeature, 
							      displayStart, displayEnd, block);
    if (subdiv && subdiv != null)  {
      subdiv.onmousedown = this.annotMouseDown;
    }
}

AnnotTrack.prototype.showRange = function(first, last, startBase, bpPerBlock, scale,
                                     containerStart, containerEnd) {
    FeatureTrack.prototype.showRange.call(this, first, last, startBase, bpPerBlock, scale,
					  containerStart, containerEnd);
//    console.log("after calling annot track.showRange(), block range: " + 
//		this.firstAttached + "--" + this.lastAttached + ",  " + (this.lastAttached - this.firstAttached));
}

AnnotTrack.prototype.onAnnotMouseDown = function(event)  {
    event = event || window.event;
    var elem = (event.currentTarget || event.srcElement);
    var featdiv = DraggableFeatureTrack.prototype.getLowestFeatureDiv(elem);
    if (featdiv && (featdiv != null))  {
	if (dojo.hasClass(featdiv, "ui-resizable"))  {
	    console.log("already resizable");
	    console.log(featdiv);
	}
	else {
	    console.log("making annotation resizable");
	    console.log(featdiv);
	    $(featdiv).resizable( {
		handles: "e, w",
		helper: "ui-resizable-helper",
		autohide: false
	    } );
	    
	}
    }
    event.stopPropagation();
}

/**
 *  feature click no-op (to override FeatureTrack.onFeatureClick, which conflicts with mouse-down selection
 */
AnnotTrack.prototype.onFeatureClick = function(event) {
    console.log("in AnnotTrack.onFeatureClick");
    event = event || window.event;
    var elem = (event.currentTarget || event.srcElement);
    var featdiv = DraggableFeatureTrack.prototype.getLowestFeatureDiv(elem);
    if (featdiv && (featdiv != null))  {
	console.log(featdiv);
    }
// do nothing
//   event.stopPropagation();
}

AnnotTrack.prototype.addToAnnotation = function(annot, features)  {
    var track = this;
    console.log("adding to annot: ");
    console.log(track);
    console.log(annot);
    var annotdiv = track.getFeatDiv(annot);
    for (var i in features)  {
	var newfeat = features[i];
	console.log(newfeat);
	var annot_subs = annot[track.fields["subfeatures"]];
	annot_subs.push(newfeat);
	// hardwiring start as f[0], end as f[1] for now -- 
	//   to fix this need to whether newfeat is a subfeat, etc.
	if (newfeat[0] < annot[0])  {annot[0] = newfeat[0];}
	if (newfeat[1] > annot[1])  {annot[1] = newfeat[1];}
	console.log("added to annotation: ");
	console.log(annot);
    }
    this.hideAll();
    this.changed();
    console.log("finished adding to annot: ");
}

AnnotTrack.prototype.makeTrackDroppable = function() {
    console.log("making track a droppable target: ");
    var target_track = this;
    var target_trackdiv = target_track.div;
    console.log(this);
    console.log(target_trackdiv);
    $(target_trackdiv).droppable(  {
	accept: ".selected-feature",   // only accept draggables that are selected feature divs
	drop: function(event, ui)  { 
	    // "this" is the div being dropped on, so same as target_trackdiv
	    console.log("draggable dropped on AnnotTrack");
	    console.log(ui);
	    var dropped_feats = DraggableFeatureTrack.selectionManager.getSelection();
	    // problem with making individual annotations droppable, so checking for "drop" on annotation here, 
	    //    and if so re-routing to add to existing annotation
	    if (AnnotTrack.annot_under_mouse != null)  {
		target_track.addToAnnotation(AnnotTrack.annot_under_mouse.feature, dropped_feats);
	    }
	    else  {
		target_track.createAnnotations(dropped_feats);
	    }
	}    
    } );
    console.log("finished making droppable target");
}

AnnotTrack.prototype.createAnnotations = function(feats)  {
    var target_track = this;
    var features_nclist = target_track.features;
    for (var i in feats)  {
	var dragfeat = feats[i];
	var source_track = dragfeat.track;
	console.log("creating annotation based on feature: ");
	console.log(dragfeat);
	var dragdiv = source_track.getFeatDiv(dragfeat);
	var is_subfeature = (!!dragfeat.parent);  // !! is shorthand for returning true if value is defined and non-null
	var newfeat = JSONUtils.convertToTrack(dragfeat, is_subfeature, source_track, target_track);
	console.log("local feat conversion: " )
	console.log(newfeat);
	if (AnnotTrack.USE_LOCAL_EDITS)  {
	    var id = "annot_" + AnnotTrack.creation_count++;
	    newfeat[target_track.fields["id"]] = id;
	    newfeat[target_track.fields["name"]] = id;
	    newfeat.uid = id;
	    console.log("new feature: ");
	    console.log(newfeat);
	    features_nclist.add(newfeat, id);
	    target_track.hideAll();
	    target_track.changed();
	}
	else  {
	    var responseFeature;
	    var source_fields = source_track.fields;
	    var source_subFields = source_track.subFields;
	    var target_fields = target_track.fields;
	    var target_subFields = target_track.subFields;
	    // creating JSON feature data struct that WebApollo server understands, 
	    //    based on JSON feature data struct that JBrowse understands
	    var afeat = JSONUtils.createApolloFeature(dragfeat, source_fields, source_subFields, "transcript");
	    console.log("createApolloFeature: ");
	    console.log(afeat);
	    
	    dojo.xhrPost( {
		postData: '{ "track": "' + target_track.name + '", "features": [ ' + JSON.stringify(afeat) + '], "operation": "add_feature" }',
		url: context_path + "/AnnotationEditorService",
		handleAs: "json",
		timeout: 5000, // Time in milliseconds
		// The LOAD function will be called on a successful response.
		load: function(response, ioArgs) { //
		    console.log("Successfully created annotation object: " + response)
		    // response processing is now handled by the long poll thread (when using servlet 3.0)
		    //  if comet-style long pollling is not working, then create annotations based on 
		    //     AnnotationEditorResponse
		    if (!AnnotTrack.USE_COMET || !target_track.comet_working)  {
			responseFeatures = response.features;
			for (var rindex in responseFeatures)  {
			    var rfeat = responseFeatures[rindex];
			    console.log("AnnotationEditorService annot object: ");
			    console.log(rfeat);
			    var jfeat = JSONUtils.createJBrowseFeature(rfeat, target_fields, target_subFields);
			    console.log("Converted annot object to JBrowse feature array: " + jfeat.uid);
			    console.log(jfeat);
			    features_nclist.add(jfeat, jfeat.uid);
			} 
			target_track.hideAll();
			target_track.changed();
		    }
		},
		// The ERROR function will be called in an error case.
		error: function(response, ioArgs) { //
		    console.log("Error creating annotation--maybe you forgot to log into the server?");
		    console.error("HTTP status code: ", ioArgs.xhr.status); //
		    //dojo.byId("replace").innerHTML = 'Loading the ressource from the server did not work'; //
		    return response;
		}
	    });
	}
    }
}

/**
*  If there are multiple AnnotTracks, each has a separate FeatureSelectionManager 
*    (contrasted with DraggableFeatureTracks, which all share the same selection and selection manager
*/
AnnotTrack.prototype.deleteSelectedFeatures = function()  {
    this.deleteAnnotations(AnnotTrack.selectedFeatures);
    selectedFeatures = [];
}

AnnotTrack.prototype.deleteAnnotations = function(annots) {
    var track = this;
    var features = '"features": [';
    var uniqueNames = [];
    for (var i in annots)  {
	var annot = annots[i];
	var uniqueName = annot.uid;
	// just checking to ensure that all features in selection are from this track -- 
	//   if not, then don't try and delete them
	if (annot.track === track)  {
	    var trackdiv = track.div;
	    var trackName = track.name;
	    var features_nclist = track.features;
	    if (i > 0) {
		features += ',';
	    }
	    features += ' { "uniquename": "' + uniqueName + '" } ';
	    uniqueNames.push(uniqueName);
	}
    }
    features += ']';
    console.log("request server deletion");
    console.log(features);

    if (AnnotTrack.USE_LOCAL_EDITS)  {
	for (var j in uniqueNames)  {
	    var id_to_delete = uniqueNames[j];
	    console.log("server deleted: " + id_to_delete);
	    features_nclist.delete(id_to_delete);
	}
	track.hideAll();
	track.changed();
    }
    else  {
	dojo.xhrPost( {
	    postData: '{ "track": "' + trackName + '", ' + features + ', "operation": "delete_feature" }',
	    url: context_path + "/AnnotationEditorService",
	    handleAs: "json",
	    timeout: 5000 * 1000, // Time in milliseconds
	    load: function(response, ioArgs) {
		if (!AnnotTrack.USE_COMET || !track.comet_working)  {
		    var responseFeatures = response.features;
		    if (!responseFeatures || responseFeatures.length == 0)  {
			// if not using comet, or comet not working
			// and no features are returned, then they were successfully deleted?
			for (var j in uniqueNames)  {
			    var id_to_delete = uniqueNames[j];
			    console.log("server deleted: " + id_to_delete);
			    features_nclist.delete(id_to_delete);
			}
			track.hideAll();
			track.changed();
		    }
		}
	    },
	    // The ERROR function will be called in an error case.
	    error: function(response, ioArgs) { // 
		console.log("Annotation server error--maybe you forgot to login to the server?")
		console.error("HTTP status code: ", ioArgs.xhr.status); //
		//dojo.byId("replace").innerHTML = 'Loading the resource from the server did not work'; //  
		return response; // 
	    }
	    
	});
    }
}

AnnotTrack.prototype.createAnnotation = function()  {

}

// AnnotTrack.prototype.addToAnnotation


// AnnotTrack.prototype.deleteFromAnnotation = function()  { }
// handle potential effect on parent?
AnnotTrack.prototype.deleteAnnotation = function()  {

}

AnnotTrack.prototype.changeAnnotationLocation = function()  {

}


/*
Copyright (c) 2010-2011 Berkeley Bioinformatics Open Projects (BBOP)

This package and its accompanying libraries are free software; you can
redistribute it and/or modify it under the terms of the LGPL (either
version 2.1, or at your option, any later version) or the Artistic
License 2.0.  Refer to LICENSE for the full license text.

*/
