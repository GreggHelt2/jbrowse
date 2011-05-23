
function AvgRange_MinMaxRange_Renderer()  {  }

AvgRange_MinMaxRange_Renderer.NAME = "AvgRange + MinMaxRange";
AvgRange_MinMaxRange_Renderer.ID = "AvgRange_MinMaxRange";

CanvasTrack.registerRenderer(AvgRange_MinMaxRange_Renderer);

AvgRange_MinMaxRange_Renderer.drawBlock = function (track, blockIndex, blockDiv,
					     leftBlock, rightBlock,
					     leftBase, rightBase,
					     scale, stripeWidth,
					     containerStart, containerEnd) {
    if (CanvasTrack.VERBOSE_RENDER) {  console.log("called AvgRange_MinMaxRange_Renderer.drawBlock");  }
    
    var mindex = track.getCoordIndex(leftBase);
    var maxdex = track.getCoordIndex(rightBase) + 1;
    if (maxdex >= track.locs.length)  { maxdex = track.locs.length-1; }
    
    //  console.log("mindex = " + mindex + ", coord = " + track.locs[mindex] + ", score = " + track.scores[mindex]);
    //  console.log("maxdex = " + maxdex + ", coord = " + track.locs[maxdex] + ", score = " + track.scores[maxdex]);
    

    // scale is in units of pixels per base
    // stripeWidth is in pixels
    // based on $(canvas).width() and $(blockDiv).width(), block div and canvas not yet 
    //     set to actual dimensions??
    // but stripeWidth appears accurate, so relying on it...
    var pixels_per_base = scale;
    var bases_per_pixel = 1.0/scale;
//    console.log("bases per pixel: " + bases_per_pixel);
    // find sumLevel
    var levels = track.wstack.sumLevels;
    var lcount = levels.length;
    var level = null;
    // need to switch to finding nearest level, rather than exact level???
    for (var lindex = 0; lindex<lcount; lindex++)  {
	var curlevel = levels[lindex];
	if (curlevel && (curlevel.pixelsPerBase == pixels_per_base)) {
	    level = curlevel;
	    break;
	}
    }
    if (level)  {
//	console.log("found level:");
//	console.log(level);
    }

    var canvas = blockDiv.canvas;
    canvas.height = 100; 
    canvas.width = stripeWidth;
    var context = canvas.getContext("2d"); 
    context.clearRect(0,0,canvas.width,canvas.height);
    //  console.log("pixels per base: " + pixels_per_base + ", bases per pixel: " + bases_per_pixel);
    if (CanvasTrack.VERBOSE_RENDER)  {
	console.log("stripeWidth: " + stripeWidth + ", end-start: " + (rightBase - leftBase) + ", block width: " + $(blockDiv).width());
	console.log("canvas coord width: " + canvas.width + ", canvas pixel width = " + $(canvas).width());
	console.log("containerStart: " + containerStart + ",  containerEnd: " + containerEnd);
    }

    // clear transform (set to identity matrix) just in case;
    context.setTransform(1,0,0,1,0,0);
    // scale first, then translate?
    // want to get 
    //    pixel_position = scale * (base_position - leftBase)

    var hscale = 100 / (track.maxviz-track.minviz);
    // for scaling by minviz/maxviz, not clipping, won't be drawn if outside of canvas bounds anyway
    if (CanvasTrack.VERBOSE_RENDER)  { console.log("hscale: " + hscale); }
//    context.scale(scale, 1.0);
    context.scale(scale, hscale);
//    context.translate(-leftBase, 0);
    context.translate(-leftBase, (track.maxviz-100));
    //  var col = CanvasTrack.canvas_test_colors[CanvasTrack.canvas_render_count % 3];
    //  context.fillStyle = col;
    //  CanvasTrack.canvas_render_count++;
    context.fillStyle = track.baseColor;

    var use_path = CanvasTrack.USE_PATH;
    if (use_path)  {
	context.beginPath();
    }
    if (pixels_per_base >= 1)  { // draw pixels_per_base wide
	if (CanvasTrack.VERBOSE_RENDER)  { console.log("drawing each point over multiple pixels"); }
	for (var index = mindex; index <= maxdex; index++)  {
	    var coord = track.locs[index];
	    var score = track.scores[index];
	    if (use_path)  {
		context.rect(coord, 100, 1, (score * -100));
	    }
	    else  {
		context.fillRect(coord, 100, 1, (score * -100));
	    }
	}
    }
    else  { 	// draw 1 pixel wide
	if (CanvasTrack.USE_LEVELS && level)  {  // current scale/zoom has a summary level, so render summary
	    mindex = track.getSumCoordIndex(leftBase, level);
//	    maxdex = track.getSumCoordIndex(rightBase, level) + 1;
	    maxdex = track.getSumCoordIndex(rightBase, level);
	    if (maxdex >= level.binMins.length)  { maxdex = level.binMins.length-1; }
	    var coords = level.binMins;
	    var mins = level.minScores;
	    var maxs = level.maxScores;
	    var avgs = level.avgScores;
	    var clength = coords.length;
	    var coord, min, max, avg; 
	   //  console.log("mindex: " + mindex + ", coords length: " + coords.length);
	   //  console.log("score: " + coords[mindex]);

	    context.fillStyle = track.unsatLighterColor;
	    for (var index = mindex; index <= maxdex; index++) {
		 if (index >= clength || index < 0)  { console.log("exceeded plot data bounds"); }
		 coord = coords[index];
		 max = maxs[index];
		 min = mins[index];
		 if (coord == undefined || max == undefined)  {
		     console.log("coord = " +  coord + ", min = " + min + ", max = " + max);
		 }
		 else  {
//		     context.fillRect(coord, 100, bases_per_pixel, (max * -100));
//		    context.fillRect(coord, 100 - (min * 100), 1 * bases_per_pixel, 1);
//		    context.fillRect(coord, 100 - (max * 100), 1 * bases_per_pixel, 1);
		    context.fillRect(coord, 100 - (min * 100), bases_per_pixel+1, ((max-min) * -100));
		 }
	    }
	    context.fillStyle = track.baseColor;
	    var prevavg = avgs[mindex];
	    var delta;
	    for (var index = mindex; index <= maxdex; index++) {
		if (index >= clength || index < 0)  { console.log("exceeded plot data bounds"); }
		coord = coords[index];
		avg = avgs[index];
		// if (min && max)  {
		if (coord == undefined || avg == undefined || prevavg == undefined)  {  // skip edge cases where avg is undefined...
		    console.log("coord = " +  coord + ", avg = " + avg);
		}
		else  {
		    if (avg > prevavg) {  delta = avg - prevavg; min = prevavg; max = avg; }
		    else  { delta = prevavg - avg; min = avg; max = prevavg; }
		    // if ( delta < 1 ) { delta = 1; }
		    context.fillRect(coord, 100 - (min * 100), bases_per_pixel+1, (delta * -100));
	            // context.fillRect(coord, 100 - (avg * 100), 2 * bases_per_pixel, 2);			
		    // context.fillRect(coord, 100, bases_per_pixel, (avg * -100));
		}
		prevavg = avg;
	    }
/*	    context.fillStyle = "#bbf";
	    for (var index = mindex; index <= maxdex; index++) {
		 if (index >= clength || index < 0)  { console.log("exceeded plot data bounds"); }
		 coord = coords[index];
		 min = mins[index];
		 if (coord == undefined || min == undefined)  {
		     console.log("coord = " +  coord + ", min = " + min + ", max = " + max);
		 }
		 else  {
		    // context.fillRect(coord, 100 - (min * 100), 1 * bases_per_pixel, 1);
		     //  context.fillRect(coord, 100 - (min * 100), bases_per_pixel+1, ((max-min) * -100));
		     context.fillRect(coord, 100, bases_per_pixel, (min * -100));
		 }
	    }
*/
	}
	else  {  // no summary level for current scale/zoom, so render actual scores
	    var coords = track.locs;
	    var scores = track.scores;
	    var clength = coords.length;
	    for (var index = mindex; index <= maxdex; index++)  {
		if (index >= clength || index < 0)  { console.log("exceeded plot data bounds"); }
		var coord = coords[index];
		var score = scores[index];
		// if (score)  {  // skip edge cases where score is undefined...
		    if (use_path)  {
			context.rect(coord, 100, bases_per_pixel, (score * -100));
		    }
		    else  {
			context.fillRect(coord, 100, bases_per_pixel, (score * -100));
		    }
		//   }
	    }
	}
    }
    if (use_path)  {
	context.fill();
	context.closePath();
    }
    //  context.fillStyle = "#000";
    //  context.fillRect(leftBase + (4 * bases_per_pixel), 0, -2 * bases_per_pixel, 100);
    //  context.fillRect(rightBase - (4 * bases_per_pixel), 0, 2 * bases_per_pixel, 100);
    track.heightUpdate(100, blockIndex);

};