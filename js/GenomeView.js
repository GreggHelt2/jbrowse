var USE_GRIDLINES = true;
var DRAW_TRACK_BORDER = false;

/**
 * Main view class, shows a scrollable, horizontal view of annotation
 * tracks.  NOTE: All coordinates are interbase.
 * @class
 * @constructor
 */
function GenomeView(elem, stripeWidth, refseq, zoomLevel, browserRoot) {
    this.DEBUG_SPLITTER = false;
    var seqCharSize = this.calculateSequenceCharacterSize( elem );
    this.charWidth = seqCharSize.width;
    this.seqHeight = seqCharSize.height;
    this.colorCdsByFrame = false;
    this.posHeight = this.calculatePositionLabelHeight( elem );
    // Add an arbitrary 50% padding between the position labels and the
    // topmost track
    this.topSpace = 1.5 * this.posHeight;

    //the reference sequence
    this.ref = refseq;
    //current scale, in pixels per bp
    this.pxPerBp = zoomLevel;
    //path prefix for static assets (e.g., cursors)
    this.browserRoot = browserRoot ? browserRoot : "";
    //width, in pixels, of the vertical stripes
    this.stripeWidth = stripeWidth;
    //the page element that the GenomeView lives in
    this.elem = elem;

    // the scrollContainer is the element that changes position
    // when the user scrolls
    this.scrollContainer = document.createElement("div");
    if (this.DEBUG_SPLITTER)  {
	dojo.connect(this.scrollContainer, "mousedown", function(e)  { console.log("scrollContainer mouseDown: "); console.log(e); } );
    }
    this.scrollContainer.id = "container";
    this.scrollContainer.style.cssText =
	"position: absolute; left: 0px; top: 0px;";
    elem.appendChild(this.scrollContainer);

    // we have a separate zoomContainer as a child of the scrollContainer.
    // they used to be the same element, but making zoomContainer separate
    // enables it to be narrower than this.elem.
    //
    // GAH zoomContainer is the container that track divs get added to, 
    this.zoomContainer = document.createElement("div");
    if (this.DEBUG_SPLITTER)  {
	dojo.connect(this.zoomContainer, "mousedown", function(e)  { console.log("zoomContainer mouseDown: "); console.log(e); } );
    }
    this.zoomContainer.id = "zoomContainer";
    this.zoomContainer.style.cssText =
	"position: absolute; left: 0px; top: 0px; height: 100%;";
    this.scrollContainer.appendChild(this.zoomContainer);

    this.outerTrackContainer = document.createElement("div");
    this.outerTrackContainer.className = "trackContainer outerTrackContainer";
    this.outerTrackContainer.style.cssText = "height: 100%;";
    this.zoomContainer.appendChild( this.outerTrackContainer );

    this.trackContainer = document.createElement("div");
    this.trackContainer.className = "trackContainer innerTrackContainer draggable";
    this.trackContainer.style.cssText = "height: 100%;";
    this.outerTrackContainer.appendChild( this.trackContainer );

    //width, in pixels of the "regular" (not min or max zoom) stripe
    this.regularStripe = stripeWidth;
    //width, in pixels, of stripes at full zoom (based on the sequence
    //character width)
    //The number of characters per stripe is somewhat arbitrarily set
    //at stripeWidth / 10
    this.fullZoomStripe = this.charWidth * (stripeWidth / 10);

    this.overview = dojo.byId("overview");
    this.overviewBox = dojo.coords(this.overview);

    this.tracks = [];
    this.uiTracks = [];
    this.trackIndices = {};
    this.cds_frame_trackcount = 0;

    //set up size state (zoom levels, stripe percentage, etc.)
    this.sizeInit();

    //distance, in pixels, from the beginning of the reference sequence
    //to the beginning of the first active stripe (block)
    //  should always be a multiple of stripeWidth
    this.offset = 0;
    //largest value for the sum of this.offset and this.getX()
    //this prevents us from scrolling off the right end of the ref seq
    this.maxLeft = this.bpToPx(this.ref.end+1) - this.dim.width;
    //smallest value for the sum of this.offset and this.getX()
    //this prevents us from scrolling off the left end of the ref seq
    this.minLeft = this.bpToPx(this.ref.start);
    //distance, in pixels, between each track
    this.trackPadding = 20;
    //extra margin to draw around the visible area, in multiples of the visible area
    //0: draw only the visible area; 0.1: draw an extra 10% around the visible area, etc.
    this.drawMargin = 0.2;
    //slide distance (pixels) * slideTimeMultiple + 200 = milliseconds for slide
    //1=1 pixel per millisecond average slide speed, larger numbers are slower
    this.slideTimeMultiple = 0.8;
    this.trackHeights = [];
    this.trackTops = [];
    this.trackLabels = [];
    this.waitElems = [dojo.byId("moveLeft"), dojo.byId("moveRight"),
		      dojo.byId("zoomIn"), dojo.byId("zoomOut"),
		      dojo.byId("bigZoomIn"), dojo.byId("bigZoomOut"),
		      document.body, elem];
    this.prevCursors = [];
    this.locationThumb = document.createElement("div");
    this.locationThumb.className = "locationThumb";
    this.overview.appendChild(this.locationThumb);
    this.locationThumbMover = new dojo.dnd.move.parentConstrainedMoveable(this.locationThumb, {area: "margin", within: true});

    if ( dojo.isIE ) {
        // if using IE, we have to do scrolling with CSS
        this.x = -parseInt( this.scrollContainer.style.left );
        this.y = -parseInt( this.scrollContainer.style.top );
        this.rawSetX = function(x) {
            this.scrollContainer.style.left = -x + "px";
            this.x = x;
        };
        this.rawSetY = function(y) {
            this.scrollContainer.style.top = -y + "px";
            this.y = y;
        };
    } else {
	this.x = this.elem.scrollLeft;
	this.y = this.elem.scrollTop;
        this.rawSetX = function(x) {
            this.elem.scrollLeft = x;
            this.x = x;
        };
        this.rawSetY = function(y) {
            this.elem.scrollTop = y;
            this.y = y;
        };
    }

    var scaleTrackDiv = document.createElement("div");
    scaleTrackDiv.className = "track static_track rubberBandAvailable";
    scaleTrackDiv.style.height = this.posHeight + "px";
    scaleTrackDiv.id = "static_track";
    this.scaleTrackDiv = scaleTrackDiv;

    this.staticTrack = new StaticTrack("static_track", "pos-label", this.posHeight);
    this.staticTrack.setViewInfo(function(height) {}, this.stripeCount,
                                 this.scaleTrackDiv, undefined, this.stripePercent,
                                 this.stripeWidth, this.pxPerBp,
                                 this.trackPadding);
    this.zoomContainer.appendChild(this.scaleTrackDiv);
    this.waitElems.push(this.scaleTrackDiv);

    if (USE_GRIDLINES)  {
    var gridTrackDiv = document.createElement("div");
    gridTrackDiv.className = "track";
    gridTrackDiv.style.cssText = "top: 0px; height: 100%;";
    gridTrackDiv.id = "gridtrack";
    var gridTrack = new GridTrack("gridtrack");
    gridTrack.setViewInfo(function(height) {}, this.stripeCount,
                          gridTrackDiv, undefined, this.stripePercent,
                          this.stripeWidth, this.pxPerBp,
                          this.trackPadding);
    this.trackContainer.appendChild(gridTrackDiv);
    this.uiTracks = [this.staticTrack, gridTrack];
    }
    else  {
	this.uiTracks = [this.staticTrack];
    }

    dojo.forEach(this.uiTracks, function(track) {
	track.showRange(0, this.stripeCount - 1,
			Math.round(this.pxToBp(this.offset)),
			Math.round(this.stripeWidth / this.pxPerBp),
			this.pxPerBp);
    }, this);

    this.zoomContainer.style.paddingTop = this.topSpace + "px";

    this.addOverviewTrack(new StaticTrack("overview_loc_track", "overview-pos", this.overviewPosHeight));
    this.showFine();
    this.showCoarse();

    this.behaviorManager = new BehaviorManager({ context: this, behaviors: this._behaviors() });
    this.behaviorManager.initialize();
};

/**
 * Behaviors (event handler bundles) for various states that the
 * GenomeView might be in.
 * @private
 */
GenomeView.prototype._behaviors = function() { return {

    // behaviors that don't change
    always: {
        apply_on_init: true,
        apply: function() {
            var handles = [];
            this.overviewTrackIterate( function(t) {
                handles.push( dojo.connect(
                    t.div, 'mousedown', dojo.hitch( this, 'startRubberZoom', this.overview_absXtoBp, t.div )
                ));
            });
            handles.push(
            		dojo.connect( this.scrollContainer,     "mousewheel",     this, 'wheelScroll', false ),
            		dojo.connect( this.scrollContainer,     "DOMMouseScroll", this, 'wheelScroll', false ),

            		dojo.connect( this.scaleTrackDiv,       "mousedown",      dojo.hitch( this, 'startRubberZoom', this.absXtoBp, this.scrollContainer )),

            		dojo.connect( this.outerTrackContainer, "dblclick",       this, 'doubleClickZoom'    ),

            		dojo.connect( this.locationThumbMover,  "onMoveStop",     this, 'thumbMoved'         ),

            		dojo.connect( this.overview,            "onclick",        this, 'overviewClicked'    ),
            		dojo.connect( this.scaleTrackDiv,       "onclick",        this, 'scaleClicked'       ),

            		// when the mouse leaves the document, need to cancel
            		// any keyboard-modifier-holding-down state
            		dojo.connect( document.body,            'onmouseleave',       this, function() {
            			this.behaviorManager.swapBehaviors('shiftMouse','normalMouse');
            		}),

            		// when the mouse leaves the document, need to cancel
            		// any keyboard-modifier-holding-down state
            		dojo.connect( document.body,            'onmouseenter',       this, function(evt) {
            			if( evt.shiftKey ) {
            				this.behaviorManager.swapBehaviors( 'normalMouse', 'shiftMouse' );
            			}
            		}),

            		dojo.connect( window, 'onkeyup', this, function(evt) {
            			if( evt.keyCode == dojo.keys.SHIFT )  { // shift
            				this.behaviorManager.swapBehaviors( 'shiftMouse', 'normalMouse' );
            			}
            			else if (evt.keyCode == dojo.keys.ALT) { // alt
            				this.behaviorManager.swapBehaviors('altMouse', 'normalMouse');
            			}
            		}),
            		dojo.connect( window, 'onkeydown', this, function(evt) {
            			if( evt.keyCode == dojo.keys.SHIFT ) { // shift
            				this.behaviorManager.swapBehaviors( 'normalMouse', 'shiftMouse' );
            			}
            			else if (evt.keyCode == dojo.keys.ALT) { // alt
            				this.behaviorManager.swapBehaviors('normalMouse', 'altMouse');
            			}
            		})
            );
            return handles;
        }
    },

    // mouse events connected for "normal" behavior
    normalMouse: {
        apply_on_init: true,
        apply: function() {
            return [
                dojo.connect( this.outerTrackContainer, "mousedown", this, 'startMouseDragScroll' )
            ];
        }
    },

    // mouse events connected when the shift button is being held down
  //  shiftMouse: {
    shiftMouse: {
        apply: function() {
            dojo.removeClass(this.trackContainer,'draggable');
            dojo.addClass(this.trackContainer,'rubberBandAvailable');
            return [
                dojo.connect( this.outerTrackContainer, "mousedown", dojo.hitch( this, 'startRubberZoom', this.absXtoBp, this.scrollContainer )),
//                dojo.connect( this.outerTrackContainer, "onclick",   this, 'scaleClicked'    )
            ];
        },
        remove: function( mgr, handles ) {
            dojo.forEach( handles, dojo.disconnect, dojo );
            dojo.removeClass(this.trackContainer,'rubberBandAvailable');
            dojo.addClass(this.trackContainer,'draggable');
        }
    },

    altMouse: {
        apply: function() {
            dojo.removeClass(this.trackContainer,'draggable');
            dojo.addClass(this.trackContainer,'rubberBandAvailable');
            return [
//                dojo.connect( this.outerTrackContainer, "mousedown", dojo.hitch( this, 'startRubberZoom', this.absXtoBp, this.scrollContainer )),
                dojo.connect( this.outerTrackContainer, "onclick",   this, 'scaleClicked'    )
            ];
        },
        remove: function( mgr, handles ) {
            dojo.forEach( handles, dojo.disconnect, dojo );
            dojo.addClass(this.trackContainer,'draggable');
        }
    },
    
    // mouse events that are connected when we are in the middle of a
    // drag-scrolling operation
    mouseDragScrolling: {
        apply: function() {
            return [
                dojo.connect(document.body, "mouseup",   this, 'dragEnd'      ),
                dojo.connect(document.body, "mousemove", this, 'dragMove'     ),
                dojo.connect(document.body, "mouseout",  this, 'checkDragOut' )
            ];
        }
    },

    // mouse events that are connected when we are in the middle of a
    // rubber-band zooming operation
    mouseRubberBandZooming: {
        apply: function() {
            return [
                dojo.connect(document.body, "mouseup",    this, 'rubberExecute'  ),
                dojo.connect(document.body, "mousemove",  this, 'rubberMove'     ),
                dojo.connect(document.body, "mouseout",   this, 'rubberCancel'   ),
                dojo.connect(window,        "onkeydown",  this, 'rubberCancel'   )
            ];
        }
    }
};};

/**
 * Conducts a test with DOM elements to measure sequence text width
 * and height.
 */
GenomeView.prototype.calculateSequenceCharacterSize = function( containerElement ) {
    var widthTest = document.createElement("div");
    widthTest.className = "sequence";
    widthTest.style.visibility = "hidden";
    var widthText = "12345678901234567890123456789012345678901234567890";
    widthTest.appendChild(document.createTextNode(widthText));
    containerElement.appendChild(widthTest);

    var result = {
        width:  widthTest.clientWidth / widthText.length,
        height: widthTest.clientHeight
    };

    containerElement.removeChild(widthTest);
    return result;
};

/**
 * Conduct a DOM test to calculate the height of div.pos-label
 * elements with a line of text in them.
 */
GenomeView.prototype.calculatePositionLabelHeight = function( containerElement ) {
    // measure the height of some arbitrary text in whatever font this
    // shows up in (set by an external CSS file)
    var heightTest = document.createElement("div");
    heightTest.className = "pos-label";
    heightTest.style.visibility = "hidden";
    heightTest.appendChild(document.createTextNode("42"));
    containerElement.appendChild(heightTest);
    var h = heightTest.clientHeight;
    containerElement.removeChild(heightTest);
    return h;
};

GenomeView.prototype.wheelScroll = function(e) {

    // 60 pixels per mouse wheel event
    this.setY( this.getY() - 60 * Util.wheel(e) );

    //the timeout is so that we don't have to run showVisibleBlocks
    //for every scroll wheel click (we just wait until so many ms
    //after the last one).
    if ( this.wheelScrollTimeout )
        window.clearTimeout( this.wheelScrollTimeout );

    // 100 milliseconds since the last scroll event is an arbitrary
    // cutoff for deciding when the user is done scrolling
    // (set by a bit of experimentation)
    this.wheelScrollTimeout = window.setTimeout( dojo.hitch( this, function() {
        this.showVisibleBlocks(true);
        this.wheelScrollTimeout = null;
    }, 100));

    dojo.stopEvent(e);
};

GenomeView.prototype.getX = function() {
    return this.x;
};

GenomeView.prototype.getY = function() {
    return this.y;
};
GenomeView.prototype.getHeight = function() {
    return this.elem.clientHeight;
};
GenomeView.prototype.getWidth = function() {
    return this.elem.clientWidth;
};

GenomeView.prototype.clampX = function(x) {
    return Math.round( Math.max( Math.min( this.maxLeft - this.offset, x),
                                 this.minLeft - this.offset
                               )
                     );
};

GenomeView.prototype.clampY = function(y) {
    return Math.round( Math.min( (y < 0 ? 0 : y),
                                 this.containerHeight- this.dim.height
                               )
                     );
};

GenomeView.prototype.setX = function(x) {
    x = this.clampX(x);
    this.rawSetX( x );
    this.updateViewDimensions( { x: x } );
    this.showFine();
};

GenomeView.prototype.setY = function(y) {
    y = this.clampY(y);
    this.rawSetY(y);
    this.updateViewDimensions( { y: y } );
};

GenomeView.prototype.rawSetPosition = function(pos) {
    this.rawSetX( pos.x );
    this.rawSetY( pos.y );
};

GenomeView.prototype.setPosition = function(pos) {
    var x = this.clampX( pos.x );
    var y = this.clampY( pos.y );
    this.updateViewDimensions( {x: x, y: y} );
    this.rawSetX( x );
    this.rawSetY( y );
    this.showFine();
};

GenomeView.prototype.getPosition = function() {
    return { x: this.x, y: this.y };
};

GenomeView.prototype.zoomCallback = function() {
    this.zoomUpdate();
};

GenomeView.prototype.afterSlide = function() {
    this.showCoarse();
    this.scrollUpdate();
    this.showVisibleBlocks(true);
};

GenomeView.prototype.doubleClickZoom = function(event) {
    if( this.dragging ) return;
    if( "animation" in this ) return;

    // if we have a timeout in flight from a scaleClicked click,
    // cancel it, cause it looks now like the user has actually
    // double-clicked
    if( this.scaleClickedTimeout ) window.clearTimeout( this.scaleClickedTimeout );

    var zoomLoc = (event.pageX - dojo.coords(this.elem, true).x) / this.dim.width;
    if (event.shiftKey) {
	this.zoomOut(event, zoomLoc, 2);
    } else {
	this.zoomIn(event, zoomLoc, 2);
    }
    dojo.stopEvent(event);
};

/** @private */
GenomeView.prototype._beforeMouseDrag = function( event ) {
    if ( this.animation ) {
        if (this.animation instanceof Zoomer) {
            dojo.stopEvent(event);
            return 0;

        } else {
            this.animation.stop();
        }
    }
    if (Util.isRightButton(event)) return 0;
    dojo.stopEvent(event);
    return 1;
};

/**
 * Event fired when a user's mouse button goes down inside the main
 * element of the genomeview.
 */
GenomeView.prototype.startMouseDragScroll = function(event) {
    if( ! this._beforeMouseDrag(event) ) return;

    this.behaviorManager.applyBehaviors('mouseDragScrolling');

    this.dragging = true;
    this.dragStartPos = {x: event.clientX,
                         y: event.clientY};
    this.winStartPos = this.getPosition();
};

/**
 * Start a rubber-band dynamic zoom.
 *
 * @param {Function} absToBp function to convert page X coordinates to
 *   base pair positions on the reference sequence.  Called in the
 *   context of the GenomeView object.
 * @param {HTMLElement} container element in which to draw the
 *   rubberbanding highlight
 * @param {Event} event the mouse event that's starting the zoom
 */
GenomeView.prototype.startRubberZoom = function( absToBp, container, event ) {
    if( ! this._beforeMouseDrag(event) ) return;

    this.behaviorManager.applyBehaviors('mouseRubberBandZooming');

    this.rubberbanding = { absFunc: absToBp, container: container };
    this.rubberbandStartPos = {x: event.clientX,
                               y: event.clientY};
    this.winStartPos = this.getPosition();
};

GenomeView.prototype._rubberStop = function(event) {
    this.behaviorManager.removeBehaviors('mouseRubberBandZooming');
    this.hideRubberHighlight();
    dojo.stopEvent(event);
};

GenomeView.prototype.rubberCancel = function(event) {
    var htmlNode = document.body.parentNode;
    var bodyNode = document.body;

    if ( !event || !(event.relatedTarget || event.toElement)
        || (htmlNode === (event.relatedTarget || event.toElement))
        || (bodyNode === (event.relatedTarget || event.toElement))) {
        this._rubberStop(event);
    }
};

GenomeView.prototype.rubberMove = function(event) {
    this.setRubberHighlight( this.rubberbandStartPos, { x: event.clientX, y: event.clientY } );
};

GenomeView.prototype.rubberExecute = function(event) {
    this._rubberStop(event);

    var start = this.rubberbandStartPos;
    var end   = { x: event.clientX, y: event.clientY };

    // cancel the rubber-zoom if the user has moved less than 3 pixels
    if( Math.abs( start.x - end.x ) < 3 ) {
        return this._rubberStop(event);
    }

    var h_start_bp = this.rubberbanding.absFunc.call( this, Math.min(start.x,end.x) );
    var h_end_bp   = this.rubberbanding.absFunc.call( this, Math.max(start.x,end.x) );
    delete this.rubberbanding;
    this.setLocation( this.ref, h_start_bp, h_end_bp );
};

// draws the rubber-banding highlight region from start.x to end.x
GenomeView.prototype.setRubberHighlight = function( start, end ) {
    var container = this.rubberbanding.container,
        container_coords = dojo.coords(container,true);

    var h = this.rubberHighlight || (function(){
        var main = this.rubberHighlight = document.createElement("div");
        main.className = 'rubber-highlight';
        main.style.position = 'absolute';
        main.style.zIndex = 1000;
        var text = document.createElement('div');
        text.appendChild( document.createTextNode("Zoom to region") );
        main.appendChild(text);
        text.style.position = 'relative';
        text.style.top = (50-container_coords.y) + "px";

        container.appendChild( main );
        return main;
    }).call(this);

    h.style.visibility  = 'visible';
    h.style.left   = Math.min(start.x,end.x) - container_coords.x + 'px';
    h.style.width  = Math.abs(end.x-start.x) + 'px';
    //console.log({ left: h.style.left, end: end.x });
};

GenomeView.prototype.dragEnd = function(event) {
    this.behaviorManager.removeBehaviors('mouseDragScrolling');

    this.dragging = false;
    dojo.stopEvent(event);
    this.showCoarse();

    this.scrollUpdate();
    this.showVisibleBlocks(true);
};

/** stop the drag if we mouse out of the view */
GenomeView.prototype.checkDragOut = function( event ) {
    var htmlNode = document.body.parentNode;
    var bodyNode = document.body;

    if (!(event.relatedTarget || event.toElement)
        || (htmlNode === (event.relatedTarget || event.toElement))
        || (bodyNode === (event.relatedTarget || event.toElement))
       ) {
           this.dragEnd(event);
    }
};

GenomeView.prototype.dragMove = function(event) {
    this.setPosition({
    	x: this.winStartPos.x - (event.clientX - this.dragStartPos.x),
    	y: this.winStartPos.y - (event.clientY - this.dragStartPos.y)
        });
    dojo.stopEvent(event);
};

GenomeView.prototype.hideRubberHighlight = function( start, end ) {
    if( this.rubberHighlight ) {
       this.rubberHighlight.parentNode.removeChild( this.rubberHighlight );
       delete this.rubberHighlight;
    }
};

/* moves the view by (distance times the width of the view) pixels */
GenomeView.prototype.slide = function(distance) {
    if (this.animation) this.animation.stop();
    this.trimVertical();
    // slide for an amount of time that's a function of the distance being
    // traveled plus an arbitrary extra 200 milliseconds so that
    // short slides aren't too fast (200 chosen by experimentation)
    new Slider(this,
	       this.afterSlide,
	       Math.abs(distance) * this.dim.width * this.slideTimeMultiple + 200,
	       distance * this.dim.width);
};

GenomeView.prototype.setLocation = function(refseq, startbp, endbp) {
    if (startbp === undefined) startbp = this.minVisible();
    if (endbp === undefined) endbp = this.maxVisible();
    if ((startbp < refseq.start) || (startbp > refseq.end))
	startbp = refseq.start;
    if ((endbp < refseq.start) || (endbp > refseq.end))
	endbp = refseq.end;

    if (this.ref != refseq) {
	this.ref = refseq;
	var removeTrack = function(track) {
	    if (track.div && track.div.parentNode)
		track.div.parentNode.removeChild(track.div);
	};
	dojo.forEach(this.tracks, removeTrack);
	dojo.forEach(this.uiTracks, function(track) { track.clear(); });
	this.overviewTrackIterate(removeTrack);

	this.addOverviewTrack(new StaticTrack("overview_loc_track", "overview-pos", this.overviewPosHeight));

        this.sizeInit();
        this.setY(0);
        this.containerHeight = this.topSpace;

        this.behaviorManager.initialize();
    }

    this.pxPerBp = Math.min(this.dim.width / (endbp - startbp), this.charWidth);
    this.curZoom = Util.findNearest(this.zoomLevels, this.pxPerBp);
    if (Math.abs(this.pxPerBp - this.zoomLevels[this.zoomLevels.length - 1]) < 0.2) {
	//the cookie-saved location is in round bases, so if the saved
	//location was at the highest zoom level, the new zoom level probably
	//won't be exactly at the highest zoom (which is necessary to trigger
	//the sequence track), so we nudge the zoom level to be exactly at
	//the highest level if it's close.
	//Exactly how close is arbitrary; 0.2 was chosen to be close
	//enough that people wouldn't notice if we fudged that much.
	console.log("nudging zoom level from %d to %d", this.pxPerBp, this.zoomLevels[this.zoomLevels.length - 1]);
	this.pxPerBp = this.zoomLevels[this.zoomLevels.length - 1];
    }
    this.stripeWidth = (this.stripeWidthForZoom(this.curZoom) / this.zoomLevels[this.curZoom]) * this.pxPerBp;
    this.instantZoomUpdate();

    this.centerAtBase((startbp + endbp) / 2, true);
};

GenomeView.prototype.stripeWidthForZoom = function(zoomLevel) {
    if ((this.zoomLevels.length - 1) == zoomLevel) {
	return this.fullZoomStripe;
    } else if (0 == zoomLevel) {
	return this.minZoomStripe;
    } else {
	return this.regularStripe;
    }
};

GenomeView.prototype.instantZoomUpdate = function() {
    this.scrollContainer.style.width =
	(this.stripeCount * this.stripeWidth) + "px";
    this.zoomContainer.style.width =
	(this.stripeCount * this.stripeWidth) + "px";
    this.maxOffset =
	this.bpToPx(this.ref.end) - this.stripeCount * this.stripeWidth;
//    this.maxLeft = this.bpToPx(this.ref.end) - this.dim.width;
    this.maxLeft = this.bpToPx(this.ref.end+1) - this.dim.width;
    this.minLeft = this.bpToPx(this.ref.start);
};

GenomeView.prototype.centerAtBase = function(base, instantly) {
    base = Math.min(Math.max(base, this.ref.start), this.ref.end);
    if (instantly) {
	var pxDist = this.bpToPx(base);
	var containerWidth = this.stripeCount * this.stripeWidth;
	var stripesLeft = Math.floor((pxDist - (containerWidth / 2)) / this.stripeWidth);
	this.offset = stripesLeft * this.stripeWidth;
	this.setX(pxDist - this.offset - (this.dim.width / 2));
	this.trackIterate(function(track) { track.clear(); });
	this.showVisibleBlocks(true);
	this.showCoarse();
    } else {
	var startbp = this.pxToBp(this.x + this.offset);
	var halfWidth = (this.dim.width / this.pxPerBp) / 2;
	var endbp = startbp + halfWidth + halfWidth;
	var center = startbp + halfWidth;
	if ((base >= (startbp  - halfWidth))
	    && (base <= (endbp + halfWidth))) {
	    //we're moving somewhere nearby, so move smoothly
	    if (this.animation) this.animation.stop();
	    var distance = (center - base) * this.pxPerBp;
	    this.trimVertical();
	    // slide for an amount of time that's a function of the
	    // distance being traveled plus an arbitrary extra 200
	    // milliseconds so that short slides aren't too fast
	    // (200 chosen by experimentation)
	    new Slider(this, this.afterSlide,
		       Math.abs(distance) * this.slideTimeMultiple + 200,
		       distance);
	} else {
	    //we're moving far away, move instantly
	    this.centerAtBase(base, true);
	}
    }
};

/**
 * @returns {Number} minimum basepair coordinate of the current
 * reference sequence visible in the genome view
 */
GenomeView.prototype.minVisible = function() {
    var mv = this.pxToBp(this.x + this.offset);

    // if we are less than one pixel from the beginning of the ref
    // seq, just say we are at the beginning.
    if( mv < this.pxToBp(1) )
        return 0;
    else
        return mv;
};

/**
 * @returns {Number} maximum basepair coordinate of the current
 * reference sequence visible in the genome view
 */
GenomeView.prototype.maxVisible = function() {
    var mv = this.pxToBp(this.x + this.offset + this.dim.width);
    // if we are less than one pixel from the end of the ref
    // seq, just say we are at the end.
    if( mv > this.ref.end - this.pxToBp(1) )
        return this.ref.end;
    else
        return mv;
};

/**
 *  assumes input x pixel is relative to visible edge of GenomeView
 */
GenomeView.prototype._locationPixToBp = function(gvpix)  {
    //    return this.pxToBp(this.x + this.offset + gvpix);
    return this.minVisible() + this.pxToBp(gvpix);
};

/**
 *  returned x pixel is relative to visible edge of GenomeView
 */
GenomeView.prototype._locationBpToPix = function(gvbp)  {
    return this.bpToPx(this.gvbp - this.minVisible());
};

/**
 *  for the input mouse event, returns genome position under mouse IN 1-BASED INTERBASE COORDINATES
 *  WARNING: returns base position relative to UI coordinate system 
 *       (which is 1-based interbase)
 *  But for most elements in genome view (features, graphs, etc.) the underlying data structures are 
 *       in 0-base interbase coordinate system
 *  So if you want data structure coordinates, you need to do (getUiGenomeCoord() - 1)
 *       or use the convenience function getGenomeCoord()
 *
 *  event can be on GenomeView.elem or any descendant DOM elements (track, block, feature divs, etc.)
 *  assumes:
 *      event is a mouse event (plain Javascript event or JQuery event)
 *      elem is a DOM element OR JQuery wrapped set (in which case result is based on first elem in result set)
 *      elem is displayed  (see JQuery.offset() docs)
 *      no border/margin/padding set on the doc <body> element  (see JQuery.offset() docs)
 *      if in IE<9, either page is not scrollable (in the HTML page sense) OR event is JQuery event
 *         (currently JBrowse index.html page is not scrollable (JBrowse internal scrolling is NOT same as HTML page scrolling))
 */
GenomeView.prototype.getUiGenomeCoord = function(event)  {
    var relXY = Util.relativeXY(event, this.zoomContainer);
    var relX = relXY.x - this.x; // adjust for diff between zoomContainer and GenomeView 
    return Math.floor(this._locationPixToBp(relX));
    // equivalent to Math.floor() of:
    //    this.minVisible() + this.pxToBp(relX);
    //    this.pxToBp(this.x + this.offset) + this.pxToBp(relXY.x - this.x);
    //    (this.x + this.offset)/this.pxPerBp + (relXY.x - this.x)/this.pxPerBp;
    //    (this.offset + relXY.x) / this.pxPerBp
    //    this.pxToBp(this.offset + relXY.x)
    // 
    // so could be rewritten as:
    // return Math.floor(this.pxToBp(this.offset + relXY.x));
};


/**
 *  for the input mouse event, returns genome position under mouse IN 0-BASED INTERBASE COORDINATES
 *  WARNING:
 *  returns genome coord in 0-based interbase (which is how internal data structure represent coords), 
 *       instead of 1-based interbase (which is how UI displays coordinates)
 *  if need display coordinates, use getUiGenomeCoord() directly instead
 *  
 *  otherwise same capability and assumptions as getUiGenomeCoord(): 
 *  event can be on GenomeView.elem or any descendant DOM elements (track, block, feature divs, etc.)
 *  assumes:
 *      event is a mouse event (plain Javascript event or JQuery event)
 *      elem is a DOM element OR JQuery wrapped set (in which case result is based on first elem in result set)
 *      elem is displayed  (see JQuery.offset() docs)
 *      no border/margin/padding set on the doc <body> element  (see JQuery.offset() docs)
 *      if in IE<9, either page is not scrollable (in the HTML page sense) OR event is JQuery event
 *         (currently JBrowse index.html page is not scrollable (JBrowse internal scrolling is NOT same as HTML page scrolling))
 * 
 */
GenomeView.prototype.getGenomeCoord = function(event)  {
    return this.getUiGenomeCoord(event) - 1;
}

GenomeView.prototype.showFine = function() {
    this.onFineMove(this.minVisible(), this.maxVisible());
};
GenomeView.prototype.showCoarse = function() {
    this.onCoarseMove(this.minVisible(), this.maxVisible());
};

/**
 * Hook for other components to dojo.connect to.
 */
GenomeView.prototype.onFineMove = function( startbp, endbp ) {};
/**
 * Hook for other components to dojo.connect to.
 */
GenomeView.prototype.onCoarseMove = function( startbp, endbp ) {};

/**
 * Hook to be called on a window resize.
 */
GenomeView.prototype.onResize = function() {
    this.sizeInit();
    this.showVisibleBlocks();
    this.showFine();
    this.showCoarse();
    this.updateViewDimensions({
        width: this.getWidth(),
        height: this.getHeight()
    });
};


/**
 * Event handler fired when the overview bar is single-clicked.
 */
GenomeView.prototype.overviewClicked = function( evt ) {
    this.centerAtBase( this.overview_absXtoBp( evt.clientX ) );
};

/**
 * Convert absolute X pixel position to base pair position on the
 * <b>overview</b> track.  This needs refactoring; a scale bar should
 * itself know how to convert an absolute X position to base pairs.
 * @param {Number} x absolute pixel X position (for example, from a click event's clientX property)
 */
GenomeView.prototype.overview_absXtoBp = function(x) {
    return ( x - this.overviewBox.x ) / this.overviewBox.w * (this.ref.end - this.ref.start) + this.ref.start;
};

/**
 * Event handler fired when the track scale bar is single-clicked.
 */
GenomeView.prototype.scaleClicked = function( evt ) {
    var bp = this.absXtoBp(evt.clientX);

    this.scaleClickedTimeout = window.setTimeout( dojo.hitch( this, function() {
        this.centerAtBase( bp );
    },100));
};

/**
 * Event handler fired when the region thumbnail in the overview bar
 * is dragged.
 */
GenomeView.prototype.thumbMoved = function(mover) {
    var pxLeft = parseInt(this.locationThumb.style.left);
    var pxWidth = parseInt(this.locationThumb.style.width);
    var pxCenter = pxLeft + (pxWidth / 2);
    this.centerAtBase(((pxCenter / this.overviewBox.w) * (this.ref.end - this.ref.start)) + this.ref.start);
};

GenomeView.prototype.checkY = function(y) {
    return Math.min((y < 0 ? 0 : y), this.containerHeight - this.dim.height);
};

/**
 * Given a new X and Y pixels position for the main track container,
 * reposition static elements that "float" over it, like track labels,
 * Y axis labels, the main track ruler, and so on.
 *
 * @param [args.x] the new X coordinate.  if not provided,
 *   elements that only need updates on the X position are not
 *   updated.
 * @param [args.y] the new Y coordinate.  if not provided,
 *   elements that only need updates on the Y position are not
 *   updated.
 */
GenomeView.prototype.updateViewDimensions = function( args ) {
    this.trackIterate( function(t) {
        t.updateViewDimensions( args );
    },this);

    if( typeof args.x == 'number' ) {
        dojo.forEach( this.trackLabels, function(l) {
            l.style.left = args.x+"px";
        });
    }
    if( typeof args.y == 'number' )
        this.staticTrack.div.style.top = args.y + "px";
};

GenomeView.prototype.showWait = function() {
    var oldCursors = [];
    for (var i = 0; i < this.waitElems.length; i++) {
	oldCursors[i] = this.waitElems[i].style.cursor;
	this.waitElems[i].style.cursor = "wait";
    }
    this.prevCursors.push(oldCursors);
};

GenomeView.prototype.showDone = function() {
    var oldCursors = this.prevCursors.pop();
    for (var i = 0; i < this.waitElems.length; i++) {
	this.waitElems[i].style.cursor = oldCursors[i];
    }
};

GenomeView.prototype.pxToBp = function(pixels) {
    return pixels / this.pxPerBp;
};

/**
 * Convert absolute pixels X position to base pair position on the
 * current reference sequence.
 * @returns {Number}
 */
GenomeView.prototype.absXtoBp = function( /**Number*/ pixels) {
    return this.pxToBp( this.getPosition().x + this.offset - dojo.coords(this.elem, true).x + pixels );
};

GenomeView.prototype.bpToPx = function(bp) {
    return bp * this.pxPerBp;
};

GenomeView.prototype.sizeInit = function() {
    this.dim = {width: this.elem.clientWidth,
                height: this.elem.clientHeight};
    // this.overviewBox = dojo.marginBox(this.overview);
    this.overviewBox = dojo.coords(this.overview);

    //scale values, in pixels per bp, for all zoom levels
    this.zoomLevels = [1/500000, 1/200000, 1/100000, 1/50000, 1/20000, 1/10000, 1/5000, 1/2000, 1/1000, 1/500, 1/200, 1/100, 1/50, 1/20, 1/10, 1/5, 1/2, 1, 2, 5, this.charWidth];
    //make sure we don't zoom out too far
    while (((this.ref.end - this.ref.start) * this.zoomLevels[0])
	   < this.dim.width) {
	this.zoomLevels.shift();
    }
    this.zoomLevels.unshift(this.dim.width / (this.ref.end - this.ref.start));

    //width, in pixels, of stripes at min zoom (so the view covers
    //the whole ref seq)
    this.minZoomStripe = this.regularStripe * (this.zoomLevels[0] / this.zoomLevels[1]);

    this.curZoom = 0;
    while (this.pxPerBp > this.zoomLevels[this.curZoom])
	this.curZoom++;
    //    this.maxLeft = this.bpToPx(this.ref.end) - this.dim.width;
    this.maxLeft = this.bpToPx(this.ref.end+1) - this.dim.width;

    delete this.stripePercent;
    //25, 50, 100 don't work as well due to the way scrollUpdate works
    var possiblePercents = [20, 10, 5, 4, 2, 1];
    for (var i = 0; i < possiblePercents.length; i++) {
	// we'll have (100 / possiblePercents[i]) stripes.
	// multiplying that number of stripes by the minimum stripe width
	// gives us the total width of the "container" div.
	// (or what that width would be if we used possiblePercents[i]
	// as our stripePercent)
	// That width should be wide enough to make sure that the user can
	// scroll at least one page-width in either direction without making
	// the container div bump into the edge of its parent element, taking
	// into account the fact that the container won't always be perfectly
	// centered (it may be as much as 1/2 stripe width off center)
	// So, (this.dim.width * 3) gives one screen-width on either side,
	// and we add a regularStripe width to handle the slightly off-center
	// cases.
	// The minimum stripe width is going to be halfway between
	// "canonical" zoom levels; the widest distance between those
	// zoom levels is 2.5-fold, so halfway between them is 0.7 times
	// the stripe width at the higher zoom level
	if (((100 / possiblePercents[i]) * (this.regularStripe * 0.7))
	    > ((this.dim.width * 3) + this.regularStripe)) {
	    this.stripePercent = possiblePercents[i];
	    break;
	}
    }

    if (this.stripePercent === undefined) {
	console.warn("stripeWidth too small: " + this.stripeWidth + ", " + this.dim.width);
	this.stripePercent = 1;
    }

    var oldX;
    var oldStripeCount = this.stripeCount;
    if (oldStripeCount) oldX = this.getX();
    this.stripeCount = Math.round(100 / this.stripePercent);

    this.scrollContainer.style.width =
	(this.stripeCount * this.stripeWidth) + "px";
    this.zoomContainer.style.width =
	(this.stripeCount * this.stripeWidth) + "px";

    var blockDelta = undefined;
    if (oldStripeCount && (oldStripeCount != this.stripeCount)) {
        blockDelta = Math.floor((oldStripeCount - this.stripeCount) / 2);
        var delta = (blockDelta * this.stripeWidth);
        var newX = this.getX() - delta;
        this.offset += delta;
        this.updateViewDimensions( { x: newX } );
        this.rawSetX(newX);
    }

    this.trackIterate(function(track, view) {
	track.sizeInit(view.stripeCount,
		       view.stripePercent,
		       blockDelta);
    });

    var newHeight = parseInt(this.scrollContainer.style.height);
    newHeight = (newHeight > this.dim.height ? newHeight : this.dim.height);

    this.scrollContainer.style.height = newHeight + "px";
    this.containerHeight = newHeight;

    var refLength = this.ref.end - this.ref.start;
    var posSize = document.createElement("div");
    posSize.className = "overview-pos";
    posSize.appendChild(document.createTextNode(Util.addCommas(this.ref.end)));
    posSize.style.visibility = "hidden";
    this.overview.appendChild(posSize);
    // we want the stripes to be at least as wide as the position labels,
    // plus an arbitrary 20% padding so it's clear which grid line
    // a position label corresponds to.
    var minStripe = posSize.clientWidth * 1.2;
    this.overviewPosHeight = posSize.clientHeight;
    this.overview.removeChild(posSize);
    for (var n = 1; n < 30; n++) {
	//http://research.att.com/~njas/sequences/A051109
	// JBrowse uses this sequence (1, 2, 5, 10, 20, 50, 100, 200, 500...)
	// as its set of zoom levels.  That gives nice round numbers for
	// bases per block, and it gives zoom transitions that feel about the
	// right size to me. -MS
	this.overviewStripeBases = (Math.pow(n % 3, 2) + 1) * Math.pow(10, Math.floor(n/3));
	this.overviewStripes = Math.ceil(refLength / this.overviewStripeBases);
	if ((this.overviewBox.w / this.overviewStripes) > minStripe) break;
	if (this.overviewStripes < 2) break;
    }

    var overviewStripePct = 100 / (refLength / this.overviewStripeBases);
    var overviewHeight = 0;
    this.overviewTrackIterate(function (track, view) {
	    track.clear();
	    track.sizeInit(view.overviewStripes,
			   overviewStripePct);
            track.showRange(0, view.overviewStripes - 1,
			    // 0, view.overviewStripeBases,
                            -1, view.overviewStripeBases,
                            view.overviewBox.w /
                            (view.ref.end - view.ref.start));
	});
    this.updateOverviewHeight();
};

GenomeView.prototype.overviewTrackIterate = function(callback) {
    var overviewTrack = this.overview.firstChild;
    do {
        if (overviewTrack && overviewTrack.track)
	    callback.call( this, overviewTrack.track, this);
    } while (overviewTrack && (overviewTrack = overviewTrack.nextSibling));
};

GenomeView.prototype.updateOverviewHeight = function(trackName, height) {
    var overviewHeight = 0;
    this.overviewTrackIterate(function (track, view) {
	overviewHeight += track.height;
    });
    this.overview.style.height = overviewHeight + "px";
    this.overviewBox = dojo.coords(this.overview);
};

GenomeView.prototype.addOverviewTrack = function(track) {
    var refLength = this.ref.end - this.ref.start;

    var overviewStripePct = 100 / (refLength / this.overviewStripeBases);
    var trackDiv = document.createElement("div");
    trackDiv.className = "track";
    trackDiv.style.height = this.overviewBox.h + "px";
    trackDiv.style.left = (((-this.ref.start) / refLength) * this.overviewBox.w) + "px";
    trackDiv.id = "overviewtrack_" + track.name;
    trackDiv.track = track;
    var view = this;
    var heightUpdate = function(height) {
	view.updateOverviewHeight();
    };
    track.setViewInfo(heightUpdate, this.overviewStripes, trackDiv,
		      undefined,
		      overviewStripePct,
		      this.overviewStripeBases,
                      this.pxPerBp,
                      this.trackPadding);
    this.overview.appendChild(trackDiv);
    this.updateOverviewHeight();

    return trackDiv;
};

GenomeView.prototype.trimVertical = function(y) {
    if (y === undefined) y = this.getY();
    var trackBottom;
    var trackTop = this.topSpace;
    var bottom = y + this.dim.height;
    for (var i = 0; i < this.tracks.length; i++) {
	if (this.tracks[i].shown) {
	    trackBottom = trackTop + this.trackHeights[i];
	    if (!((trackBottom > y) && (trackTop < bottom))) {
		this.tracks[i].hideAll();
	    }
	    trackTop = trackBottom + this.trackPadding;
	}
    }
};

GenomeView.prototype.zoomIn = function(e, zoomLoc, steps) {
    if (this.animation) return;
    this._unsetPosBeforeZoom();
    if (zoomLoc === undefined) zoomLoc = 0.5;
    if (steps === undefined) steps = 1;
    steps = Math.min(steps, (this.zoomLevels.length - 1) - this.curZoom);
    if ((0 == steps) && (this.pxPerBp == this.zoomLevels[this.curZoom]))
        return;

    this.showWait();
    var pos = this.getPosition();
    this.trimVertical(pos.y);

    var scale = this.zoomLevels[this.curZoom + steps] / this.pxPerBp;
    var fixedBp = this.pxToBp(pos.x + this.offset + (zoomLoc * this.dim.width));
    this.curZoom += steps;
    this.pxPerBp = this.zoomLevels[this.curZoom];
    this.maxLeft = this.bpToPx(this.ref.end+1) - this.dim.width;

    for (var track = 0; track < this.tracks.length; track++)
	this.tracks[track].startZoom(this.pxPerBp,
				     fixedBp - ((zoomLoc * this.dim.width)
						/ this.pxPerBp),
				     fixedBp + (((1 - zoomLoc) * this.dim.width)
						/ this.pxPerBp));
    //YAHOO.log("centerBp: " + centerBp + "; estimated post-zoom start base: " + (centerBp - ((zoomLoc * this.dim.width) / this.pxPerBp)) + ", end base: " + (centerBp + (((1 - zoomLoc) * this.dim.width) / this.pxPerBp)));

    var thisObj = this;
    // Zooms take an arbitrary 700 milliseconds, which feels about right
    // to me, although if the zooms were smoother they could probably
    // get faster without becoming off-putting. -MS
    new Zoomer(scale, this,
	       function() {thisObj.zoomUpdate(zoomLoc, fixedBp);},
	       700, zoomLoc);
};

GenomeView.prototype.zoomToBaseLevel = function(e, pos) {
    if (this.animation) return;

    this._setPosBeforeZoom(this.minVisible(), this.maxVisible(), this.curZoom);
    var zoomLoc = 0.5;
    var steps = 100000;
    if (steps === undefined) steps = 1;
    steps = Math.min(steps, (this.zoomLevels.length - 1) - this.curZoom);
    if (0 == steps) return;

    this.showWait();
    this.trimVertical();

    var scale = this.zoomLevels[this.curZoom + steps] / this.pxPerBp;
    var fixedBp = pos;
    this.curZoom += steps;
    this.pxPerBp = this.zoomLevels[this.curZoom];
    this.maxLeft = (this.pxPerBp * this.ref.end) - this.dim.width;

    for (var track = 0; track < this.tracks.length; track++)
	this.tracks[track].startZoom(this.pxPerBp,
				     fixedBp - ((zoomLoc * this.dim.width)
						/ this.pxPerBp),
				     fixedBp + (((1 - zoomLoc) * this.dim.width)
						/ this.pxPerBp));
    //YAHOO.log("centerBp: " + centerBp + "; estimated post-zoom start base: " + (centerBp - ((zoomLoc * this.dim.width) / this.pxPerBp)) + ", end base: " + (centerBp + (((1 - zoomLoc) * this.dim.width) / this.pxPerBp)));

    // Zooms take an arbitrary 700 milliseconds, which feels about right
    // to me, although if the zooms were smoother they could probably
    // get faster without becoming off-putting. -MS
    new Zoomer(scale, this,
               function() {this.zoomUpdate(zoomLoc, fixedBp);},
               700, zoomLoc);
};


GenomeView.prototype.zoomOut = function(e, zoomLoc, steps) {
    if (this.animation) return;
    this._unsetPosBeforeZoom();
    if (steps === undefined) steps = 1;
    steps = Math.min(steps, this.curZoom);
    if (0 == steps) return;

    this.showWait();
    var pos = this.getPosition();
    this.trimVertical(pos.y);
    if (zoomLoc === undefined) zoomLoc = 0.5;
    var scale = this.zoomLevels[this.curZoom - steps] / this.pxPerBp;
    var edgeDist = this.bpToPx(this.ref.end) - (this.offset + pos.x + this.dim.width);
    //zoomLoc is a number on [0,1] that indicates
    //the fixed point of the zoom
    zoomLoc = Math.max(zoomLoc, 1 - (((edgeDist * scale) / (1 - scale)) / this.dim.width));
    edgeDist = pos.x + this.offset - this.bpToPx(this.ref.start);
    zoomLoc = Math.min(zoomLoc, ((edgeDist * scale) / (1 - scale)) / this.dim.width);
    var fixedBp = this.pxToBp(pos.x + this.offset + (zoomLoc * this.dim.width));
    this.curZoom -= steps;
    this.pxPerBp = this.zoomLevels[this.curZoom];

    for (var track = 0; track < this.tracks.length; track++)
	this.tracks[track].startZoom(this.pxPerBp,
				     fixedBp - ((zoomLoc * this.dim.width)
						/ this.pxPerBp),
				     fixedBp + (((1 - zoomLoc) * this.dim.width)
						/ this.pxPerBp));

    //YAHOO.log("centerBp: " + centerBp + "; estimated post-zoom start base: " + (centerBp - ((zoomLoc * this.dim.width) / this.pxPerBp)) + ", end base: " + (centerBp + (((1 - zoomLoc) * this.dim.width) / this.pxPerBp)));
    this.minLeft = this.pxPerBp * this.ref.start;

    // Zooms take an arbitrary 700 milliseconds, which feels about right
    // to me, although if the zooms were smoother they could probably
    // get faster without becoming off-putting. -MS
    new Zoomer(scale, this, 
               function() {this.zoomUpdate(zoomLoc, fixedBp);},
               700, zoomLoc);
};

GenomeView.prototype.zoomBackOut = function(e) {
    if (this.animation) return;

    if (!this.isZoomedToBase()) {
    	return;
    }

    var min = this.posBeforeZoom.min;
    var max = this.posBeforeZoom.max;
    var zoom = this.posBeforeZoom.zoom;
    
    this.posBeforeZoom = undefined;
    
    var steps = 1;
    var zoomLoc = 0.5;

    this.showWait();
    
    this.curZoom = zoom;

    var scale = this.zoomLevels[this.curZoom - steps] / this.pxPerBp;
    var fixedBp = (min + max) / 2;
    this.pxPerBp = this.zoomLevels[this.curZoom];

    for (var track = 0; track < this.tracks.length; track++) {
    	this.tracks[track].startZoom(this.pxPerBp,
    			fixedBp - ((zoomLoc * this.dim.width)
    					/ this.pxPerBp),
    					fixedBp + (((1 - zoomLoc) * this.dim.width)
    							/ this.pxPerBp));
	}
    
    this.minLeft = this.pxPerBp * this.ref.start;
    var thisObj = this;
    // Zooms take an arbitrary 700 milliseconds, which feels about right
    // to me, although if the zooms were smoother they could probably
    // get faster without becoming off-putting. -MS
    new Zoomer(scale, this,
	       function() {thisObj.setLocation(thisObj.ref, min, max); thisObj.zoomUpdate(zoomLoc, fixedBp); },
	       700, zoomLoc);
};

GenomeView.prototype.isZoomedToBase = function() {
	return this.posBeforeZoom !== undefined;
};

GenomeView.prototype._setPosBeforeZoom = function(min, max, zoom) {
    this.posBeforeZoom = { "min": min, "max": max, "zoom": zoom };
};

GenomeView.prototype._unsetPosBeforeZoom = function() {
	this.posBeforeZoom = undefined;
};

GenomeView.prototype.zoomUpdate = function(zoomLoc, fixedBp) {
    var eWidth = this.elem.clientWidth;
    var centerPx = this.bpToPx(fixedBp) - (zoomLoc * eWidth) + (eWidth / 2);
    this.stripeWidth = this.stripeWidthForZoom(this.curZoom);
    this.scrollContainer.style.width =
	(this.stripeCount * this.stripeWidth) + "px";
    this.zoomContainer.style.width =
	(this.stripeCount * this.stripeWidth) + "px";
    var centerStripe = Math.round(centerPx / this.stripeWidth);
    var firstStripe = (centerStripe - ((this.stripeCount) / 2)) | 0;
    this.offset = firstStripe * this.stripeWidth;
    this.maxOffset = this.bpToPx(this.ref.end+1) - this.stripeCount * this.stripeWidth;
    this.maxLeft = this.bpToPx(this.ref.end+1) - this.dim.width;
    this.minLeft = this.bpToPx(this.ref.start);
    this.zoomContainer.style.left = "0px";
    this.setX((centerPx - this.offset) - (eWidth / 2));
    dojo.forEach(this.uiTracks, function(track) { track.clear(); });
    for (var track = 0; track < this.tracks.length; track++)
	this.tracks[track].endZoom(this.pxPerBp, Math.round(this.stripeWidth / this.pxPerBp));
    //YAHOO.log("post-zoom start base: " + this.pxToBp(this.offset + this.getX()) + ", end base: " + this.pxToBp(this.offset + this.getX() + this.dim.width));
    this.showVisibleBlocks(true);
    this.showDone();
    this.showCoarse();
};

GenomeView.prototype.scrollUpdate = function() {
    var x = this.getX();
    var numStripes = this.stripeCount;
    var cWidth = numStripes * this.stripeWidth;
    var eWidth = this.dim.width;
    //dx: horizontal distance between the centers of
    //this.scrollContainer and this.elem
    var dx = (cWidth / 2) - ((eWidth / 2) + x);
    //If dx is negative, we add stripes on the right, if positive,
    //add on the left.
    //We remove stripes from the other side to keep cWidth the same.
    //The end goal is to minimize dx while making sure the surviving
    //stripes end up in the same place.

    var dStripes = (dx / this.stripeWidth) | 0;
    if (0 == dStripes) return;
    var changedStripes = Math.abs(dStripes);

    var newOffset = this.offset - (dStripes * this.stripeWidth);

    if (this.offset == newOffset) return;
    this.offset = newOffset;

    this.trackIterate(function(track) { track.moveBlocks(dStripes); });

    var newX = x + (dStripes * this.stripeWidth);
    this.updateViewDimensions( { x: newX } );
    this.rawSetX(newX);
    var firstVisible = (newX / this.stripeWidth) | 0;
};


GenomeView.prototype.trackHeightUpdate = function(trackName, height) {
    var y = this.getY();
    // found operator precedence bug -- must put "x in y" in parantheses, "!" has higher precedence!!
    //    if (! trackName in this.trackIndices) return;
    if (! (trackName in this.trackIndices)) return; 
    var track = this.trackIndices[trackName];
    if (Math.abs(height - this.trackHeights[track]) < 1) return;

    // console.log("trackHeightUpdate: " + trackName + " " + this.trackHeights[track] + " -> " + height);
    // if the bottom of this track is a above the halfway point,
    // and we're not all the way at the top,
    if ((((this.trackTops[track] + this.trackHeights[track]) - y)
	 <  (this.dim.height / 2))
	&& (y > 0) ) {
	// scroll so that lower tracks stay in place on screen
	this.setY(y + (height - this.trackHeights[track]));
	//console.log("track " + trackName + ": " + this.trackHeights[track] + " -> " + height + "; y: " + y + " -> " + this.getY());
    }
    this.trackHeights[track] = height;
    this.tracks[track].div.style.height = (height + this.trackPadding) + "px";
    var nextTop = this.trackTops[track];
    if (this.tracks[track].shown) nextTop += height + this.trackPadding;
    for (var i = track + 1; i < this.tracks.length; i++) {
	this.trackTops[i] = nextTop;
	this.tracks[i].div.style.top = nextTop + "px";
	if (this.tracks[i].shown)
	    nextTop += this.trackHeights[i] + this.trackPadding;
    }
    this.containerHeight = Math.max(nextTop, this.getY() + this.dim.height);
    this.scrollContainer.style.height = this.containerHeight + "px";
};

GenomeView.prototype.showVisibleBlocks = function(updateHeight, pos, startX, endX) {
    // pos.x is pixel position of left edge of view within it's scroll container?
    //   but changes based on shuffling of blocks???
    if (pos === undefined) pos = this.getPosition();
    // startX is pixel position relative to scroll container to start filling with blocks
    //   includes padding left of visible area to make scrolling/zooming animations look better
    if (startX === undefined) startX = pos.x - (this.drawMargin * this.dim.width);
    // endX is pixel position relative to scroll container to end filling with blocks
    //   includes padding right of visible area to make scrolling/zooming animations look better
    if (endX === undefined) endX = pos.x + ((1 + this.drawMargin) * this.dim.width);
//    console.log("startX = " + startX + ", endX = " + endX + 
//		", width = " + this.dim.width + ", pos.x = "  + pos.x + ", blockWidth = " + this.stripeWidth);
    // GAH
    // not sure what the bitwise OR with zero ("| 0") is doing in the following???
    //  leftVisible is index into "active" blocks array of leftmost (first) block that needs to be rendered 
    //       (may actually not be in view due to padding)
    //       changes with block shuffling
    var leftVisible = Math.max(0, (startX / this.stripeWidth) | 0);
    //  rightVisible is index into "active" blocks array of rightmost (last) block that needs to be rendered 
    //       (may actually not be in view due to padding)
    //       changes with block shuffling
    var rightVisible = Math.min(this.stripeCount - 1,
				(endX / this.stripeWidth) | 0);


    var bpPerBlock = Math.round(this.stripeWidth / this.pxPerBp);

    var startBase = Math.round(this.pxToBp((leftVisible * this.stripeWidth)
					   + this.offset));
    // GAH decrementing startBase inherited from merge of GMOD/jbrowse:master, 
    //    not sure if should do this in WebApollo, but for now preserving from merge
    startBase -= 1;

    var containerStart = Math.round(this.pxToBp(this.offset));
    var containerEnd =
	Math.round(this.pxToBp(this.offset
			       + (this.stripeCount * this.stripeWidth)));

/*    console.log("GenomeView.showVisibleBlocks() called: " + 
	"leftVisible = " + leftVisible + ", rightVisible = " + rightVisible + 
        ", startBase = " + startBase + ", bpPerBlock = " + bpPerBlock + 
	", containerStart = " + containerStart + ", containerEnd = " + containerEnd);
*/
    this.trackIterate(function(track, view) {
	track.showRange(leftVisible, rightVisible,
			startBase, bpPerBlock,
			view.pxPerBp,
			containerStart, containerEnd);
    });

    // GAH temporarily handling edge-matching here, need to eventually move to 
    //    having FeatureEdgeMatchManager listening for view re-render events...
    var selected = DraggableFeatureTrack.selectionManager.getSelection();
    var annot_selected = AnnotTrack.annotSelectionManager.getSelection();
    FeatureEdgeMatchManager.singleton.selectionCleared();
    //    for (var i in selected)  {
    for (var i = 0; i < selected.length; ++i) {
	FeatureEdgeMatchManager.singleton.selectionAdded(selected[i]);
    }
    //    for (var i in annot_selected)   {
    for (var i = 0; i < annot_selected.length; ++i) {
	FeatureEdgeMatchManager.singleton.selectionAdded(annot_selected[i]);
    }

    // GAH temporarily handling 

};

GenomeView.prototype.addTrack = function(track) {
    console.log("adding track to main view: " + track.name);
    var trackNum = this.tracks.length;
    var labelDiv = document.createElement("div");
    labelDiv.className = "track-label dojoDndHandle";
    labelDiv.id = "label_" + track.name;
    labelDiv.title = "to turn off, drag into track list";
    this.trackLabels.push(labelDiv);
    var trackDiv = document.createElement("div");
    trackDiv.className = "track";
    trackDiv.id = "track_" + track.name;
    trackDiv.track = track;
    if (DRAW_TRACK_BORDER)  {
	trackDiv.style.border = "1px solid gray"
    }

    if (track.name == "Annotations") {
	trackDiv.style.backgroundColor = "#FFFFDD";
	// labelDiv.style.backgroundColor = "#77AAFF";
    }

    track.gview = this;
    var view = this;

    var heightUpdate = function(height) {
        view.trackHeightUpdate(track.name, height);
    };
    track.setViewInfo(heightUpdate, this.stripeCount, trackDiv, labelDiv,
		      this.stripePercent, this.stripeWidth,
                      this.pxPerBp, this.trackPadding);

    labelDiv.style.position = "absolute";
    labelDiv.style.top = "0px";
    labelDiv.style.left = this.getX() + "px";


    trackDiv.appendChild(labelDiv);

    track.updateViewDimensions({
        x: this.getX(),
        y: this.getY(),
        height: this.getHeight(),
        width: this.getWidth()
     });

    return trackDiv;
};

GenomeView.prototype.trackIterate = function(callback) {
    var i;
    for (i = 0; i < this.uiTracks.length; i++)
        callback(this.uiTracks[i], this);
    for (i = 0; i < this.tracks.length; i++)
        callback(this.tracks[i], this);
};

/* this function must be called whenever tracks in the GenomeView
 * are added, removed, or reordered
 */
GenomeView.prototype.updateTrackList = function() {
    var tracks = [];
    // after a track has been dragged, the DOM is the only place
    // that knows the new ordering
    var containerChild = this.trackContainer.firstChild;
    do {
        // this test excludes UI tracks, whose divs don't have a track property
        if (containerChild.track) tracks.push(containerChild.track);
    } while ((containerChild = containerChild.nextSibling));
    this.tracks = tracks;

    var newIndices = {};
    var newHeights = new Array(this.tracks.length);
    for (var i = 0; i < tracks.length; i++) {
        newIndices[tracks[i].name] = i;
        if (tracks[i].name in this.trackIndices) {
            newHeights[i] = this.trackHeights[this.trackIndices[tracks[i].name]];
        } else {
            newHeights[i] = 0;
        }
        this.trackIndices[tracks[i].name] = i;
    }
    this.trackIndices = newIndices;
    this.trackHeights = newHeights;
    var nextTop = this.topSpace;
    for (var i = 0; i < this.tracks.length; i++) {
        this.trackTops[i] = nextTop;
        this.tracks[i].div.style.top = nextTop + "px";
        if (this.tracks[i].shown)
            nextTop += this.trackHeights[i] + this.trackPadding;
    }
};

GenomeView.prototype.setBrowser = function(browser) {
	this.browser = browser;
}

/*

  Copyright (c) 2007-2009 The Evolutionary Software Foundation

  Created by Mitchell Skinner <mitch_skinner@berkeley.edu>

  This package and its accompanying libraries are free software; you can
  redistribute it and/or modify it under the terms of the LGPL (either
  version 2.1, or at your option, any later version) or the Artistic
  License 2.0.  Refer to LICENSE for the full license text.

*/
